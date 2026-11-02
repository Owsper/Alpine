// Text-only record of the interview. Kept in memory until it is sent to the backend; audio is never kept.

import type { Transcript, TranscriptTurn } from './backendClient'

export class TranscriptBuilder {
  private readonly turns: TranscriptTurn[] = []
  private readonly startedAt = Date.now()

  add(turn: TranscriptTurn): void {
    this.turns.push(turn)
  }

  toJSON(): Transcript {
    return { turns: [...this.turns], durationSec: Math.round((Date.now() - this.startedAt) / 1000) }
  }
}
