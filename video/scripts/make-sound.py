"""Synthesises the promo's soundtrack from scratch (no samples, no third-party music).

An ambient pad on A minor, a soft pulse under the middle, and effects on the cues of src/Promo.jsx:
soft swells on scene changes, a hit on the logo, clicks while questions type out, plucks as score rings fill,
a rising sweep on the climb and a final swell. Writes public/alpine-sound.wav.

Run with any Python that has numpy and soundfile:  python scripts/make-sound.py
"""

from pathlib import Path

import numpy as np
import soundfile as sf

SR = 44100
FPS = 30
SCENES = [150, 175, 150, 165, 210, 205, 155, 140]  # keep in sync with src/Promo.jsx
TRANSITION = 15
STARTS = [0]
for length in SCENES[:-1]:
    STARTS.append(STARTS[-1] + length - TRANSITION)
TOTAL = (STARTS[-1] + SCENES[-1]) / FPS
N = int(TOTAL * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

left = np.zeros(N)
right = np.zeros(N)


def sec(frame):
    return frame / FPS


def add(signal, start, pan=0.0, gain=1.0):
    """Mixes a mono signal in at `start` seconds, panned -1 (left) to 1 (right)."""
    i = int(start * SR)
    if i >= N:
        return
    signal = signal[: N - i] * gain
    left[i : i + len(signal)] += signal * np.sqrt((1 - pan) / 2)
    right[i : i + len(signal)] += signal * np.sqrt((1 + pan) / 2)


def lowpass(x, cutoff):
    """One-pole low-pass; `cutoff` may be a number or an array (a moving filter)."""
    cutoff = np.broadcast_to(cutoff, x.shape)
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for k in range(len(x)):
        acc = (1 - a[k]) * x[k] + a[k] * acc
        y[k] = acc
    return y


def env(length, attack, release):
    n = int(length * SR)
    e = np.ones(n)
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r) ** 2
    return e


def note(freq, length, attack=0.005, release=None, harmonics=(1, 0.3, 0.1)):
    n = int(length * SR)
    tt = np.arange(n) / SR
    tone = sum(h * np.sin(2 * np.pi * freq * (i + 1) * tt) for i, h in enumerate(harmonics))
    return tone * env(length, attack, release or length * 0.9)


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


# ---- pad: Am – F – C – G, slow and wide ----
CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]
bar = TOTAL / 8
pad_l = np.zeros(N)
pad_r = np.zeros(N)
for b in range(8):
    chord = CHORDS[b % 4]
    start = int(b * bar * SR)
    length = int(bar * SR * 1.35)
    tt = np.arange(length) / SR
    e = np.sin(np.pi * np.clip(np.arange(length) / length, 0, 1)) ** 1.5
    for m in chord:
        f = hz(m)
        for detune, side in ((0.997, pad_l), (1.003, pad_r)):
            wave = np.sin(2 * np.pi * f * detune * tt) + 0.25 * np.sin(2 * np.pi * f * 2 * detune * tt + 0.7)
            end = min(N, start + length)
            side[start:end] += (wave * e)[: end - start] * 0.05
swell = np.interp(t, [0, 2, TOTAL - 6, TOTAL - 1.5, TOTAL], [0, 1, 1, 1.25, 0])
left += pad_l * swell
right += pad_r * swell

# low drone that opens up through the video
drone = (np.sin(2 * np.pi * hz(33) * t) + 0.4 * np.sin(2 * np.pi * hz(45) * t)) * 0.06
left += drone * swell
right += drone * swell

# ---- soft pulse under the product part (steps → climb), 96 bpm ----
beat = 60 / 96
for k in np.arange(sec(STARTS[3]), sec(STARTS[7]), beat):
    n = int(0.35 * SR)
    tt = np.arange(n) / SR
    kick = np.sin(2 * np.pi * (48 + 60 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9)
    add(kick, k, gain=0.22)

# ---- swells on every scene change: a soft rising tone, no noise (noise read as static) ----
for i, s in enumerate(STARTS[1:]):
    length = 0.8
    n = int(length * SR)
    tt = np.arange(n) / SR
    freq = 180 * 2 ** (tt / length * 1.2)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    tone = np.sin(phase) + 0.35 * np.sin(2 * phase) + 0.15 * np.sin(3 * phase)
    shape = np.sin(np.pi * tt / length) ** 3
    add(lowpass(tone * shape, 1200), sec(s) - length / 2 + TRANSITION / FPS / 2, pan=-0.4 if i % 2 else 0.4, gain=0.09)

# ---- logo hit: low boom + a glassy shimmer ----
logo = sec(STARTS[2] + 20)
n = int(2.5 * SR)
tt = np.arange(n) / SR
boom = np.sin(2 * np.pi * (40 + 70 * np.exp(-tt * 12)) * tt) * np.exp(-tt * 3)
add(boom, logo, gain=0.55)
for m, delay in ((81, 0), (88, 0.06), (93, 0.12)):
    add(note(hz(m), 2.2, release=2.0, harmonics=(1, 0.15)), logo + delay, pan=(m - 88) / 10, gain=0.07)

# ---- typing clicks while questions appear (Live scene) ----
def clicks(start_frame, chars, speed):
    for c in range(0, chars, 2):
        at = sec(STARTS[4] + start_frame + c / speed) + rng.uniform(-0.01, 0.01)
        n = int(0.02 * SR)
        click = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 400)
        add(lowpass(click, 3500), at, pan=rng.uniform(-0.3, 0.3), gain=0.18)


clicks(4, 62, 1.4)
clicks(122, 80, 1.6)

# ---- plucks as the six score rings fill (Report) ----
for i, m in enumerate([69, 72, 74, 76, 79, 81]):
    add(note(hz(m), 0.9, release=0.85, harmonics=(1, 0.4, 0.15, 0.05)), sec(STARTS[5] + 24 + i * 6), pan=-0.5 + i * 0.2, gain=0.12)

# ---- rising sweep while the altitude line climbs ----
c0, c1 = sec(STARTS[6] + 20), sec(STARTS[6] + 100)
n = int((c1 - c0) * SR)
tt = np.arange(n) / SR
freq = 220 * 2 ** (tt / (c1 - c0) * 1.5)
rise = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.linspace(0, 1, n) ** 2
add(rise * env(c1 - c0, 0.3, 0.2)[:n], c0, gain=0.07)

# ---- final: soft hit on the button and a bright chord ----
end_hit = sec(STARTS[7] + 50)
add(boom * 0.7, end_hit, gain=0.5)
for m in (69, 72, 76, 81):
    add(note(hz(m), 3.0, attack=0.04, release=2.6, harmonics=(1, 0.2)), end_hit, pan=(m - 75) / 12, gain=0.06)

# ---- master: gentle limiter and fades ----
mix = np.stack([left, right], axis=1)
mix *= np.interp(t, [0, 0.6, TOTAL - 1.2, TOTAL], [0, 1, 1, 0])[:, None]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 0.89 / max(1e-9, np.abs(mix).max())

out = Path(__file__).resolve().parent.parent / "public" / "alpine-sound.wav"
sf.write(out, mix.astype(np.float32), SR, subtype="PCM_16")
print(f"wrote {out} ({TOTAL:.2f} s)")
