// Every tunable value lives here: timings, thresholds, endpoints, wording.

export const config = {
  api: {
    asr: '/api/voice/asr',
    chat: '/api/voice/chat',
    tts: '/api/voice/tts',
    health: '/api/health',
  },
  /** RNNoise in the browser removes fans, typing and room noise before speech detection sees the audio. */
  noiseSuppression: true,
  /** Sample rate the speech recogniser expects. */
  asrSampleRate: 16000,
  vad: {
    /** Input level (RMS, 0–1) that counts as speech. */
    startRms: 0.02,
    /** While the interviewer is talking the threshold rises, so its own voice leaking into the mic does not cut it off. */
    startRmsWhileSpeaking: 0.05,
    /** Speech must last this long before it counts, which ignores clicks and coughs. */
    startMs: 160,
    /** Speech has to be this many times louder than the room's background noise. */
    noiseFloorMultiple: 3,
    /** How quickly the background noise estimate follows the room (per audio frame, 0–1). */
    noiseFloorAdapt: 0.05,
    /** Utterances with less actual voice than this are discarded, never sent to recognition. */
    minVoicedMs: 350,
    /** Silence that ends an answer. Lower is snappier, higher lets people pause to think. */
    endSilenceMs: 1200,
    /** Audio kept from just before speech was detected, so the first syllable is not lost. */
    preRollMs: 300,
    maxUtteranceMs: 45_000,
  },
  /** First words are scripted on the client so the AI disclosure is always said (EU AI Act Art. 50). */
  disclosure: "Hi, I'm an AI interviewer.",
  flow: {
    /** Quiet time after the last piece of speech before the answer counts (on top of vad.endSilenceMs). */
    answerGraceMs: 1300,
    /** Said before the question when the candidate asks to hear it again. */
    repeatPrefix: 'Of course.',
    /** If the model has not produced a follow-up by then, the interview simply moves on. */
    followupDeadlineMs: 5000,
    /** Neutral on purpose: the interviewer never gives feedback during the interview. */
    acknowledgements: ['Thank you.', 'Got it.', 'Okay, thanks.', 'Understood, thank you.'],
    wrapUp: 'That was the last question. Thank you for your time. Your answers are being saved, and your report will be ready shortly.',
  },
  /** The dashboard's report page (Alpine), opened when the interview is saved. */
  /** Session to load when the URL has no ?session= parameter. */
  defaultSessionId: 'practice',
} as const
