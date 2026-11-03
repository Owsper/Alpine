# Alpine videos

Two videos made with [Remotion](https://www.remotion.dev), plus everything needed to rebuild them.

| Video | File | What it is |
| --- | --- | --- |
| Product demo | `out/alpine-demo.mp4` | ~86 s. The real app, recorded end to end: job → facts → interview → report → overview, with narration. |
| Promo | `out/alpine-promo.mp4` | ~41 s. Animated piece in the Alpine design, with voice-over. |

All sound is made here: the music is synthesised by script and the narration is spoken by Kokoro,
the same local voice the Alpine interviewer uses. No third-party music or voices.

## Setup

```bash
npm install
npm run studio          # preview and edit both videos in Remotion Studio
```

The Python scripts need numpy, soundfile and kokoro-onnx; the backend's `.venv` already has them,
and the Kokoro model files are read from `../backend/models`.

## Promo

```bash
python scripts/make-sound.py    # music and effects → public/alpine-sound.wav
python scripts/make-voice.py    # narration, mixed over it → public/alpine-mix.wav
npm run render                  # → out/alpine-promo.mp4
```

Texts and timing live in `src/Promo.jsx` (scenes) and `scripts/make-voice.py` (`LINES`).

## Product demo

1. Start a second copy of the app on a throwaway database, next to your own (commands at the top of
   `demo/record.mjs`): backend on port 8101 with `DATABASE_PATH=demo.db`, frontend on 5175 with `API_PORT=8101`.
2. Record, convert, cut and render:

```bash
npm run record:demo             # Playwright drives the app → demo/out/walkthrough.webm + markers.json
npx remotion ffmpeg -i demo/out/walkthrough.webm -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p -an public/walkthrough.mp4
python demo/build.py            # segments, narration and music → src/demo-timeline.json, public/demo-mix.wav
npm run render:demo             # → out/alpine-demo.mp4
```

Narration lines and which part of the recording each segment uses are in `demo/build.py` (`SEGMENTS`).
The recording answers by typing, since a headless browser cannot speak into the microphone.
