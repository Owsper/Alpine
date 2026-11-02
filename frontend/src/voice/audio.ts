// Microphone capture with a simple energy-based voice activity detector.
// Audio only lives in memory for the length of one answer and is never stored.

import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor'
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'
import { config } from './config'

/** RNNoise only works at this rate. */
const RNNOISE_RATE = 48000

/** Puts RNNoise between the mic and everything else, so fans and keyboards never reach speech detection. */
async function addNoiseSuppression(ctx: AudioContext, source: AudioNode): Promise<AudioNode> {
  const wasmBinary = await loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl })
  await ctx.audioWorklet.addModule(rnnoiseWorkletUrl)
  const rnnoise = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary })
  source.connect(rnnoise)
  return rnnoise
}

export interface MicEvents {
  onLevel: (rms: number) => void
  onSpeechStart: () => void
  /** Enough voice to be sure it is speech; the moment to interrupt the interviewer. */
  onConfirmedSpeech: () => void
  onUtterance: (wav: Blob, durationMs: number) => void
}

export class Mic {
  /** Set while the interviewer is speaking, so a louder voice is needed to interrupt. */
  interviewerSpeaking = false
  paused = false
  /** Whether RNNoise actually loaded (it can fail on browsers without AudioWorklet). */
  noiseSuppressed = false

  private ctx?: AudioContext
  private stream?: MediaStream
  private node?: ScriptProcessorNode
  private preRoll: Float32Array[] = []
  private chunks: Float32Array[] = []
  private speaking = false
  private loudMs = 0
  private silentMs = 0
  private speechMs = 0
  private voicedMs = 0
  private noiseFloor = 0
  private readonly events: MicEvents

  constructor(events: MicEvents) {
    this.events = events
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    })
    this.ctx = new AudioContext({ sampleRate: config.noiseSuppression ? RNNOISE_RATE : undefined })
    let input: AudioNode = this.ctx.createMediaStreamSource(this.stream)
    if (config.noiseSuppression) {
      try {
        input = await addNoiseSuppression(this.ctx, input)
        this.noiseSuppressed = true
      } catch (error) {
        // Without it the mic still works, just with more false starts in a noisy room.
        console.warn('[voice] RNNoise unavailable, continuing without noise suppression', error)
      }
    }
    // ScriptProcessor is deprecated but runs everywhere, including Quest Browser, with no extra file to serve.
    this.node = this.ctx.createScriptProcessor(2048, 1, 1)
    this.node.onaudioprocess = (event) => this.process(event.inputBuffer.getChannelData(0))
    input.connect(this.node)
    // The node only processes while connected; its output buffer stays silent.
    this.node.connect(this.ctx.destination)
  }

  stop(): void {
    this.node?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.ctx?.close()
    this.reset()
  }

  private reset(): void {
    this.speaking = false
    this.loudMs = 0
    this.silentMs = 0
    this.speechMs = 0
    this.voicedMs = 0
    this.chunks = []
    this.preRoll = []
  }

  private process(input: Float32Array): void {
    const ctx = this.ctx
    if (!ctx) return
    const frame = new Float32Array(input)
    const frameMs = (frame.length / ctx.sampleRate) * 1000
    let sum = 0
    for (const sample of frame) sum += sample * sample
    const rms = Math.sqrt(sum / frame.length)
    this.events.onLevel(rms)

    if (this.paused) {
      this.reset()
      return
    }

    const { vad } = config
    // Speech has to stand out from the room: fans and keyboards raise the floor, so the bar rises with it.
    const floorBased = this.noiseFloor * vad.noiseFloorMultiple
    const threshold = Math.max(this.interviewerSpeaking ? vad.startRmsWhileSpeaking : vad.startRms, floorBased)

    if (!this.speaking) {
      // Only quiet frames teach the noise floor, so talking never raises it.
      if (rms < threshold) this.noiseFloor += (rms - this.noiseFloor) * vad.noiseFloorAdapt
      this.preRoll.push(frame)
      while (this.preRoll.length * frameMs > vad.preRollMs) this.preRoll.shift()
      this.loudMs = rms > threshold ? this.loudMs + frameMs : 0
      if (this.loudMs >= vad.startMs) {
        this.speaking = true
        this.chunks = [...this.preRoll]
        this.speechMs = this.loudMs
        this.voicedMs = this.loudMs
        this.silentMs = 0
        this.events.onSpeechStart()
      }
      return
    }

    this.chunks.push(frame)
    this.speechMs += frameMs
    if (rms >= threshold * 0.6) {
      const before = this.voicedMs
      this.voicedMs += frameMs
      // Fires once per utterance, when it is clearly a person talking and not a click.
      if (before < vad.minVoicedMs && this.voicedMs >= vad.minVoicedMs) this.events.onConfirmedSpeech()
    }
    this.silentMs = rms < threshold * 0.6 ? this.silentMs + frameMs : 0
    if (this.silentMs >= vad.endSilenceMs || this.speechMs >= vad.maxUtteranceMs) {
      // A short burst is a cough or a click, not an answer: drop it instead of sending it to recognition.
      if (this.voicedMs < vad.minVoicedMs) this.reset()
      else this.finish(ctx.sampleRate)
    }
  }

  private finish(inputRate: number): void {
    const length = this.chunks.reduce((total, chunk) => total + chunk.length, 0)
    const merged = new Float32Array(length)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    const durationMs = (length / inputRate) * 1000
    this.reset()
    this.events.onUtterance(encodeWav(downsample(merged, inputRate, config.asrSampleRate), config.asrSampleRate), durationMs)
  }
}

/** Averages input samples down to the target rate, which also acts as a crude low-pass filter. */
export function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const output = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), input.length)
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    output[i] = sum / Math.max(end - start, 1)
  }
  return output
}

/** 16-bit mono PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })
  return new Blob([buffer], { type: 'audio/wav' })
}
