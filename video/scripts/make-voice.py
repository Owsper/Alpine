"""Voice-over for the promo, spoken by Kokoro-82M (the same local voice the Alpine interviewer uses),
then mixed over public/alpine-sound.wav with the music ducked under the voice. Writes public/alpine-mix.wav.

Needs kokoro-onnx, numpy and soundfile, plus the Kokoro model files (Alpine's backend/models/):
    python scripts/make-voice.py   (models default to ../backend/models)
"""

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

FPS = 30
SR = 44100
SCENES = [150, 175, 150, 165, 210, 205, 155, 140]  # keep in sync with src/Promo.jsx
TRANSITION = 15
STARTS = [0]
for length in SCENES[:-1]:
    STARTS.append(STARTS[-1] + length - TRANSITION)

# (scene, delay in frames after the scene starts, line)
LINES = [
    (0, 8, "Every interview has one moment. The moment you lose the room."),
    (1, 10, "Knowing the answer, and saying it well under pressure, are two different skills."),
    (2, 22, "Meet Alpine. Rehearse the interview. Then just show up."),
    (3, 8, "Paste the job. Check the facts. Then answer out loud."),
    (4, 14, "A voice interviewer listens. And when you stay vague, it follows up on your own words."),
    (5, 10, "Every answer is scored, quoting what you actually said, with one thing to fix next."),
    (6, 8, "Your weakest spots become the next interview. Every take climbs."),
    (7, 10, "Run it once here first. Alpine."),
]

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--models", default=str(root.parent / "backend" / "models"))
parser.add_argument("--voice", default="am_michael")
parser.add_argument("--speed", type=float, default=0.9)
args = parser.parse_args()

tts = Kokoro(str(Path(args.models) / "kokoro-v1.0.onnx"), str(Path(args.models) / "voices-v1.0.bin"))
music, rate = sf.read(root / "public" / "alpine-sound.wav")
assert rate == SR
voice = np.zeros(len(music))

for scene, delay, text in LINES:
    audio, sr = tts.create(text, voice=args.voice, speed=args.speed, lang="en-us")
    audio = np.interp(np.arange(int(len(audio) * SR / sr)) * sr / SR, np.arange(len(audio)), audio)  # 24 kHz → 44.1 kHz
    start = (STARTS[scene] + delay) / FPS
    window = (STARTS[scene] + SCENES[scene] - TRANSITION // 2) / FPS - start
    length = len(audio) / SR
    print(f"scene {scene + 1}: {length:4.1f} s of {window:4.1f} s {'OK' if length <= window else 'TOO LONG'}  {text}")
    i = int(start * SR)
    voice[i : i + len(audio)] += audio[: len(voice) - i]

voice *= 0.9 / np.abs(voice).max()
voice = np.tanh(voice * 2.5) / np.tanh(2.5)  # gentle compression so quiet syllables stay audible
# Duck the music under the voice: a smoothed envelope of the voice pulls the music down to about a fifth.
level = np.convolve(np.abs(voice), np.ones(int(0.3 * SR)) / int(0.3 * SR), mode="same")
duck = 1 - 0.8 * np.clip(level / 0.04, 0, 1)
mix = music * 0.75 * duck[:, None] + voice[:, None]
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix *= 0.95 / np.abs(mix).max()
sf.write(root / "public" / "alpine-mix.wav", mix.astype(np.float32), SR, subtype="PCM_16")
print("wrote public/alpine-mix.wav")
