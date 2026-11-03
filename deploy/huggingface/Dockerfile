# Alpine on a free Hugging Face Space (CPU only): one container serves the landing page, the app and the API.

# 1. Build the frontend (landing + app)
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. The API with the voice models
FROM python:3.13-slim
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user backend/requirements.txt ./requirements.txt
# torch is only needed for the GPU-only Qwen engines, so the CPU image leaves it out.
RUN grep -v '^torch' requirements.txt > requirements-cpu.txt && pip install --no-cache-dir --user -r requirements-cpu.txt

# Voice models baked into the image so the Space starts without downloading them.
RUN mkdir -p models && python -c "import urllib.request as u; base='https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'; [u.urlretrieve(base + f, 'models/' + f) for f in ('kokoro-v1.0.onnx', 'voices-v1.0.bin')]"
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

COPY --chown=user backend/app ./app
COPY --chown=user --from=web /web/dist ./static

# No GPU here: Whisper small on the CPU. The database lives in /tmp and resets when the Space restarts.
ENV VOICE_ENABLED=true \
    WHISPER_MODEL=small \
    WHISPER_DEVICE=cpu \
    DEMO_MODE=true \
    DATABASE_PATH=/tmp/alpine.db \
    ISOLATE_CLIENTS=true \
    STATIC_DIR=/home/user/app/static
# LLM_BASE_URL and LLM_API_KEY come from the Space's secrets (Settings → Variables and secrets).

EXPOSE 7860
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
