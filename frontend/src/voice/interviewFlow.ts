// The interview state machine. The client runs the flow (which question, when to move on, the timer);
// the model is only asked for an optional follow-up, so a slow or failed model never stalls the interview.
//
//   INTRO -> Q1 -> [follow-up] -> Q2 -> ... -> Q5 -> WRAP_UP -> SAVING -> DONE

import { sendTranscript, type Session } from './backendClient'
import { config } from './config'
import { type ChatMessage, type Speaker, streamChat, synthesize } from './localVoice'
import { TranscriptBuilder } from './transcript'

export type FlowState = 'intro' | 'question' | 'followup' | 'wrapup' | 'saving' | 'done' | 'error'

export interface FlowEvents {
  onState: (state: FlowState) => void
  /** What the interviewer is saying right now, for subtitles. */
  onCaption: (text: string) => void
  onQuestion: (index: number) => void
  onLog: (text: string) => void
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

/** "Can you repeat that?", "Sorry, what was the question?", "Pardon?" and similar. */
const REPEAT_REQUEST =
  /\b(repeat|say (that|it) again|come again|pardon|one more time|didn'?t (catch|hear|get|understand)|what was the question|rephrase|sorry,? what)\b/i

export function isRepeatRequest(text: string): boolean {
  return words(text) <= 14 && REPEAT_REQUEST.test(text)
}

export class InterviewFlow {
  readonly transcript = new TranscriptBuilder()
  private state: FlowState = 'intro'
  private index = -1
  private followupUsed = false
  /** Synthesized audio for every scripted line, started up front so questions play without waiting. */
  private readonly clips = new Map<string, Promise<ArrayBuffer>>()
  private ackCount = 0
  /** The question or follow-up the candidate is currently answering, for "can you repeat that?". */
  private lastPrompt = ''
  private readonly session: Session
  private readonly speaker: Speaker
  private readonly events: FlowEvents

  constructor(session: Session, speaker: Speaker, events: FlowEvents) {
    this.session = session
    this.speaker = speaker
    this.events = events
  }

  get questionCount(): number {
    return this.session.questions.length
  }

  private get intro(): string {
    const { role, company } = this.session
    return `${config.disclosure} I'll be interviewing you for the ${role} role at ${company}. I'll ask you ${this.questionCount} questions. Take your time with each answer. Let's begin.`
  }

  /** Synthesizes scripted lines one after another, in the order they will be needed. */
  private prepare(): void {
    const lines = [this.intro, ...this.session.questions.map((q) => q.text), ...config.flow.acknowledgements, config.flow.wrapUp]
    let chain: Promise<unknown> = Promise.resolve()
    for (const line of lines) {
      const clip = chain.then(() => synthesize(line))
      clip.catch(() => undefined)
      this.clips.set(line, clip)
      chain = clip.catch(() => undefined)
    }
  }

  private clip(text: string): Promise<ArrayBuffer> {
    return this.clips.get(text) ?? synthesize(text)
  }

  private setState(state: FlowState): void {
    this.state = state
    this.events.onState(state)
  }

  private questionId(): string {
    return this.session.questions[Math.max(this.index, 0)]?.id ?? 'intro'
  }

  /** Speaks a line, records it in the transcript, and resolves when it has finished playing. */
  private async say(text: string): Promise<void> {
    const startedAt = Date.now()
    this.events.onCaption(text)
    await this.speaker.enqueue(this.clip(text))
    this.transcript.add({ questionId: this.questionId(), role: 'interviewer', text, startedAt, endedAt: Date.now() })
  }

  async start(): Promise<void> {
    this.prepare()
    this.setState('intro')
    await this.say(this.intro)
    await this.ask(0)
  }

  private async ask(index: number): Promise<void> {
    this.index = index
    this.followupUsed = false
    this.events.onQuestion(index)
    this.setState('question')
    this.lastPrompt = this.session.questions[index].text
    await this.say(this.lastPrompt)
  }

  /** Called with each finished candidate answer. */
  async onAnswer(text: string, startedAt: number, endedAt: number): Promise<void> {
    if (this.state !== 'question' && this.state !== 'followup') return
    this.transcript.add({ questionId: this.questionId(), role: 'candidate', text, startedAt, endedAt })

    // Asking to hear the question again is not an answer: repeat it and keep waiting.
    if (isRepeatRequest(text)) {
      this.events.onLog('Repeating the question on request')
      await this.say(`${config.flow.repeatPrefix} ${this.lastPrompt}`)
      return
    }

    if (!this.followupUsed && words(text) < config.flow.followupBelowWords) {
      this.followupUsed = true
      const followup = await this.followup(text)
      if (followup) {
        this.setState('followup')
        this.lastPrompt = followup
        await this.say(followup)
        return
      }
    }
    await this.next()
  }

  private async next(): Promise<void> {
    if (this.index + 1 < this.questionCount) {
      const ack = config.flow.acknowledgements[this.ackCount++ % config.flow.acknowledgements.length]
      void this.say(ack)
      await this.ask(this.index + 1)
    } else {
      await this.wrapUp()
    }
  }

  /** User pressed "End interview", or the last question was answered. */
  async wrapUp(): Promise<void> {
    if (this.state === 'wrapup' || this.state === 'saving' || this.state === 'done') return
    this.setState('wrapup')
    await this.say(config.flow.wrapUp)
    this.setState('saving')
    const transcript = this.transcript.toJSON()
    console.log('[interview] transcript', transcript)
    try {
      await sendTranscript(this.session.sessionId, transcript)
      this.setState('done')
    } catch (error) {
      this.events.onLog(String(error))
      this.setState('error')
    }
  }

  /** One short follow-up from the model, or null if it is slow or says nothing usable. */
  private async followup(answer: string): Promise<string | null> {
    const question = this.session.questions[this.index]
    const facts = this.session.facts.map((fact) => `- ${fact.claim}`).join('\n')
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          `You are an AI interviewer for the ${this.session.role} role at ${this.session.company}. ` +
          'The candidate gave a very short answer. Ask exactly ONE short follow-up question, under 20 words, ' +
          'that asks for a concrete example, their own action, or the result. ' +
          'Never comment on tone, emotions, confidence or appearance. Never score, grade or give feedback. ' +
          `Only these facts about the company may be used:\n${facts}\nOutput only the question.`,
      },
      { role: 'assistant', content: question.text },
      { role: 'user', content: answer },
    ]
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.flow.followupDeadlineMs)
    try {
      let reply = ''
      for await (const piece of streamChat(messages, controller.signal)) reply += piece
      reply = reply.trim()
      return reply.endsWith('?') && words(reply) <= 30 ? reply : null
    } catch {
      this.events.onLog('Follow-up skipped: the model was too slow')
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
