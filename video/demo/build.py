"""Builds the demo video's timeline and soundtrack from the screen recording.

Reads demo/out/markers.json (from record.mjs), cuts the recording into segments, voices one narrator line
per segment with Kokoro (the voice Alpine's interviewer uses), and writes:
  src/demo-timeline.json   segments in frames, read by src/Demo.jsx
  public/demo-mix.wav      ambient pad + soft swells + narration, music ducked under the voice

    python demo/build.py   (models default to ../backend/models)
"""

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

FPS = 30
SR = 44100
FADE = 10  # frames of cross-fade between segments
root = Path(__file__).resolve().parent.parent
m = json.loads((root / "demo" / "out" / "markers.json").read_text())

# kind, source start/end in seconds (video only), playback rate, step label, narration
SEGMENTS = [
    ("card", None, None, 1, "", "This is Alpine. A mock interview you answer out loud."),
    ("video", m["landing"] + 1.2, m["landing-cta"] + 0.9, 1.0, "Alpine", "It shows you exactly where an answer fell apart, and gives you a better next take."),
    ("video", m["job"] - 0.3, m["research"] + 1.2, 1.35, "1 · The job", "Start with the job. Pick a role, add the company, and paste the posting."),
    ("video", m["facts"] - 0.2, m["ask"] + 1.0, 1.0, "2 · The facts", "Alpine researches the company. You keep only the facts that are right."),
    ("video", m["live"] - 0.2, m["answer-concrete"] + 0.2, 1.3, "3 · The interview", "Then the interview starts. Answer by voice, or type. A vague answer gets a follow-up, built from your own words."),
    ("video", m["answer-concrete"] + 0.2, m["end"] + 1.2, 2.2, "3 · The interview", "Specific answers move you on. End the session whenever you are done."),
    ("video", m["report"] - 0.6, m["download"] + 1.8, 1.25, "4 · The report", "Every take is graded on six dimensions. Each score quotes what you said, with one thing to fix. Replay it, or download it as a PDF."),
    ("video", m["overview"] + 0.1, m["end-of-recording"] - 0.3, 1.2, "5 · Your climb", "The overview tracks your progress: scores per take, filler words, and how far you have climbed."),
    ("card", None, None, 1, "", "Alpine. Rehearse the interview. Then just show up."),
]

parser = argparse.ArgumentParser()
parser.add_argument("--models", default=str(root.parent / "backend" / "models"))
parser.add_argument("--voice", default="am_michael")
parser.add_argument("--speed", type=float, default=0.9)
args = parser.parse_args()
tts = Kokoro(str(Path(args.models) / "kokoro-v1.0.onnx"), str(Path(args.models) / "voices-v1.0.bin"))

LEAD = 0.35  # the line starts this long after its segment does
TAIL = 0.6   # and leaves this much room before the next one
timeline, clips, start = [], [], 0
for kind, a, b, rate, label, line in SEGMENTS:
    audio, sr = tts.create(line, voice=args.voice, speed=args.speed, lang="en-us")
    audio = np.interp(np.arange(int(len(audio) * SR / sr)) * sr / SR, np.arange(len(audio)), audio)
    spoken = len(audio) / SR
    natural = (b - a) / rate if kind == "video" else 0
    # A segment lasts as long as its footage, but never shorter than its narration needs.
    seconds = max(natural, spoken + LEAD + TAIL, 3.2)
    if kind == "video" and natural < spoken + LEAD + TAIL:
        rate = (b - a) / seconds  # slow the footage down rather than cut the narration short
    frames = round(seconds * FPS)
    timeline.append({"kind": kind, "from": a, "to": b, "rate": round(rate, 4), "frames": frames, "label": label, "caption": line, "start": start})
    clips.append((start / FPS + LEAD, audio))
    print(f"{kind:5s} {label:18s} {seconds:5.1f} s  (voice {spoken:4.1f} s, rate {rate:.2f})")
    start += frames - FADE

total_frames = start + FADE
(root / "src" / "demo-timeline.json").write_text(json.dumps({"fps": FPS, "fade": FADE, "frames": total_frames, "segments": timeline}, indent=2), encoding="utf-8")

# ---- soundtrack ----
N = int(total_frames / FPS * SR)
t = np.arange(N) / SR
total = N / SR
voice = np.zeros(N)
for at, audio in clips:
    i = int(at * SR)
    voice[i : i + len(audio)] += audio[: N - i]


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]
bar = 4 * 60 / 72 * 2  # two bars of 72 bpm per chord
pad = np.zeros((N, 2))
for b in range(int(total / bar) + 2):
    i0 = int(b * bar * SR)
    if i0 >= N:
        break
    n = min(int(bar * SR * 1.35), N - i0)
    tt = np.arange(n) / SR
    e = np.sin(np.pi * np.arange(n) / int(bar * SR * 1.35)) ** 1.5
    for note in CHORDS[b % 4]:
        for ch, detune in ((0, 0.997), (1, 1.003)):
            f = hz(note) * detune
            pad[i0 : i0 + n, ch] += (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt + 0.7)) * e * 0.05
drone = (np.sin(2 * np.pi * hz(33) * t) + 0.4 * np.sin(2 * np.pi * hz(45) * t)) * 0.05
music = pad + drone[:, None]

# soft rising swells on each cut (tonal, no noise)
for seg in timeline[1:]:
    at = seg["start"] / FPS - 0.25
    n = int(0.8 * SR)
    tt = np.arange(n) / SR
    phase = 2 * np.pi * np.cumsum(180 * 2 ** (tt / 0.8 * 1.2)) / SR
    swell = (np.sin(phase) + 0.35 * np.sin(2 * phase)) * np.sin(np.pi * tt / 0.8) ** 3 * 0.06
    i = int(at * SR)
    music[i : i + n] += swell[: N - i, None]

music *= np.interp(t, [0, 1.5, total - 3, total], [0, 1, 1, 0])[:, None]
music *= 0.6 / max(1e-9, np.abs(music).max())

voice *= 0.9 / np.abs(voice).max()
voice = np.tanh(voice * 2.5) / np.tanh(2.5)
level = np.convolve(np.abs(voice), np.ones(int(0.3 * SR)) / int(0.3 * SR), mode="same")
duck = 1 - 0.8 * np.clip(level / 0.04, 0, 1)
mix = music * duck[:, None] + voice[:, None]
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix *= 0.95 / np.abs(mix).max()
sf.write(root / "public" / "demo-mix.wav", mix.astype(np.float32), SR, subtype="PCM_16")
print(f"total {total:.1f} s -> src/demo-timeline.json, public/demo-mix.wav")
