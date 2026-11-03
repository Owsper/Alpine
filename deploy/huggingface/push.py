"""Publishes Alpine to a free Hugging Face Space (Docker, CPU).

Needs a logged-in Hugging Face CLI (`hf auth login` with a write token). Run from the repo root:
    backend/.venv/Scripts/python deploy/huggingface/push.py            # → <your-user>/alpine
    backend/.venv/Scripts/python deploy/huggingface/push.py --space you/name

Only source files are uploaded: no .env, databases, model files, node_modules or builds.
The LLM key is read from backend/.env and stored as a Space *secret*, never in a file.
"""

import argparse
import shutil
import tempfile
from pathlib import Path

from dotenv import dotenv_values
from huggingface_hub import HfApi

root = Path(__file__).resolve().parents[2]
here = Path(__file__).resolve().parent

parser = argparse.ArgumentParser()
parser.add_argument("--space", help="user/name of the Space (default: <your-user>/alpine)")
args = parser.parse_args()

api = HfApi()
space = args.space or f"{api.whoami()['name']}/alpine"
api.create_repo(space, repo_type="space", space_sdk="docker", exist_ok=True)

env = dotenv_values(root / "backend" / ".env")
if not env.get("LLM_API_KEY"):
    raise SystemExit("backend/.env has no LLM_API_KEY to give the Space.")
api.add_space_secret(space, "LLM_API_KEY", env["LLM_API_KEY"])
if env.get("LLM_MODELS"):
    api.add_space_variable(space, "LLM_MODELS", env["LLM_MODELS"])

skip = shutil.ignore_patterns("node_modules", "dist", ".venv", "__pycache__", ".pytest_cache", "*.db", ".env", "models", "tests", ".hallmark")
with tempfile.TemporaryDirectory() as tmp:
    stage = Path(tmp)
    shutil.copy(here / "Dockerfile", stage / "Dockerfile")
    shutil.copy(here / "README.md", stage / "README.md")
    shutil.copytree(root / "frontend", stage / "frontend", ignore=skip)
    (stage / "backend").mkdir()
    shutil.copy(root / "backend" / "requirements.txt", stage / "backend" / "requirements.txt")
    shutil.copytree(root / "backend" / "app", stage / "backend" / "app", ignore=skip)
    leaked = [p for p in stage.rglob("*") if p.name == ".env" or p.suffix == ".db"]
    assert not leaked, f"refusing to upload {leaked}"
    api.upload_folder(repo_id=space, repo_type="space", folder_path=stage, commit_message="Deploy Alpine", delete_patterns=["*"])

print(f"Pushed. Build log and app: https://huggingface.co/spaces/{space}")
print(f"Direct link once built:     https://{space.replace('/', '-').lower()}.hf.space")
