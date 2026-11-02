// Client for the laptop voice server: speech to text, the interviewer's reply, and text to speech.

import { config } from './config'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function ensureOk(response: Response): Promise<Response> {
  if (!response.ok) throw new Error(`${response.url} failed: ${response.status} ${await response.text()}`)
  return response
}

export async function transcribe(wav: Blob, signal?: AbortSignal): Promise<string> {
  const response = await ensureOk(
    await fetch(config.api.asr, { method: 'POST', body: wav, headers: { 'Content-Type': 'audio/wav' }, signal }),
  )
  const { text } = (await response.json()) as { text: string }
  return text.trim()
}

/** Yields the reply as it streams in (server-sent events of `{ text }`). */
export async function* streamChat(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const response = await ensureOk(
    await fetch(config.api.chat, {
      method: 'POST',
      body: JSON.stringify({ messages }),
      headers: { 'Content-Type': 'application/json' },
      signal,
    }),
  )
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += value
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      const data = event.replace(/^data:\s*/, '')
      if (data === '[DONE]') return
      const parsed = JSON.parse(data) as { text?: string; error?: string }
      if (parsed.error) throw new Error(parsed.error)
      if (parsed.text) yield parsed.text
    }
  }
}

export async function synthesize(text: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await ensureOk(
    await fetch(config.api.tts, {
      method: 'POST',
      body: JSON.stringify({ text }),
      headers: { 'Content-Type': 'application/json' },
      signal,
    }),
  )
  return response.arrayBuffer()
}

/** Splits finished sentences off the front of streamed text, so speech can start before the reply ends. */
export function takeSentences(text: string): { sentences: string[]; rest: string } {
  const sentences: string[] = []
  const pattern = /[^.!?]+[.!?]+["')\]]?\s+/g
  let consumed = 0
  for (const match of text.matchAll(pattern)) {
    sentences.push(match[0].trim())
    consumed = (match.index ?? 0) + match[0].length
  }
  return { sentences, rest: text.slice(consumed) }
}

/** Plays synthesized clips back to back and exposes the output level for the avatar's mouth. */
export class Speaker {
  onStart?: () => void
  onIdle?: () => void

  private readonly ctx = new AudioContext()
  private readonly analyser = this.ctx.createAnalyser()
  private readonly levels = new Uint8Array(256)
  private queue: Promise<void> = Promise.resolve()
  private sources = new Set<AudioBufferSourceNode>()
  private playing = 0
  private generation = 0

  constructor() {
    this.analyser.fftSize = 512
    this.analyser.connect(this.ctx.destination)
  }

  get speaking(): boolean {
    return this.playing > 0
  }

  /** Browsers only allow audio after a user gesture; call this from a click. */
  async unlock(): Promise<void> {
    await this.ctx.resume()
  }

  /**
   * Clips play in the order they are enqueued, even if they finish decoding out of order.
   * Resolves once this clip has played, or immediately if it was dropped by stop().
   */
  enqueue(clip: Promise<ArrayBuffer>): Promise<void> {
    const generation = this.generation
    const decoded = clip.then((bytes) => this.ctx.decodeAudioData(bytes))
    decoded.catch(() => undefined)
    this.queue = this.queue.then(async () => {
      if (generation !== this.generation) return
      let buffer: AudioBuffer
      try {
        buffer = await decoded
      } catch (error) {
        console.error('[voice] could not play a clip', error)
        return
      }
      if (generation !== this.generation) return
      await this.play(buffer)
    })
    return this.queue
  }

  private play(buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.connect(this.analyser)
      this.sources.add(source)
      if (this.playing++ === 0) this.onStart?.()
      source.onended = () => {
        this.sources.delete(source)
        if (--this.playing === 0) this.onIdle?.()
        resolve()
      }
      source.start()
    })
  }

  /** Barge-in: drop everything queued and cut the current clip. */
  stop(): void {
    this.generation++
    this.queue = Promise.resolve()
    for (const source of this.sources) source.stop()
  }

  /** 0–1, how loud the interviewer is right now. */
  level(): number {
    this.analyser.getByteTimeDomainData(this.levels)
    let peak = 0
    for (const value of this.levels) peak = Math.max(peak, Math.abs(value - 128))
    return peak / 128
  }
}
