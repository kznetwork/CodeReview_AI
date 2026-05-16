"""OpenRouter API smoke tests: text + vision (separate models)."""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODEL_TEXT = "nvidia/nemotron-3-super-120b-a12b:free"
MODEL_VISION = "google/gemma-4-26b-a4b-it:free"

# Small public image (OpenRouter docs style)
SAMPLE_IMAGE_URL = (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/"
    "Gfp-wisconsin-madison-the-nature-boardwalk.jpg/"
    "800px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
)


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        print(f"ERROR: {path} not found.", file=sys.stderr)
        sys.exit(1)
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def post_chat(payload: dict) -> tuple[int, dict | str]:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        return 0, "OPENROUTER_API_KEY is empty"

    body = json.dumps(payload).encode("utf-8")
    req = Request(
        OPENROUTER_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/local/refrigerator-test",
            "X-OpenRouter-Title": "Refrigerator OpenRouter test",
        },
    )
    try:
        with urlopen(req, timeout=120) as resp:
            data = resp.read().decode("utf-8")
            return resp.status, json.loads(data)
    except HTTPError as e:
        try:
            err_body = e.read().decode("utf-8")
            parsed = json.loads(err_body)
        except Exception:
            parsed = err_body
        return e.code, parsed
    except URLError as e:
        return 0, str(e.reason if hasattr(e, "reason") else e)


def extract_message(data: dict) -> str:
    try:
        choice = data["choices"][0]
        msg = choice.get("message") or choice.get("delta") or {}
        content = msg.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
            return "\n".join(parts).strip()
        return json.dumps(msg, ensure_ascii=False)[:500]
    except (KeyError, IndexError, TypeError):
        return json.dumps(data, ensure_ascii=False)[:800]


def main() -> None:
    load_dotenv(ENV_PATH)

    print("=== 1) Text (Nemotron) ===")
    text_payload = {
        "model": MODEL_TEXT,
        "messages": [
            {
                "role": "user",
                "content": (
                    'Answer in one line only, no preamble: '
                    'what is 17 + 25? Reply with the integer only.'
                ),
            }
        ],
        "max_tokens": 64,
        "temperature": 0.2,
    }
    status, text_result = post_chat(text_payload)
    print(f"HTTP {status}")
    if isinstance(text_result, dict) and "choices" in text_result:
        print("Assistant:", extract_message(text_result))
        if text_result.get("usage"):
            print("Usage:", text_result["usage"])
    else:
        print("Body:", text_result)

    print()
    print("=== 2) Vision (Gemma) ===")
    vision_payload = {
        "model": MODEL_VISION,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Describe the image in one short sentence in Korean.",
                    },
                    {"type": "image_url", "image_url": {"url": SAMPLE_IMAGE_URL}},
                ],
            }
        ],
        "max_tokens": 128,
        "temperature": 0.2,
    }
    status2, vision_result = post_chat(vision_payload)
    if status2 == 429 and isinstance(vision_result, dict):
        print("429 on first try; waiting 8s and retrying once…")
        time.sleep(8)
        status2, vision_result = post_chat(vision_payload)
    print(f"HTTP {status2}")
    if isinstance(vision_result, dict) and "choices" in vision_result:
        print("Assistant:", extract_message(vision_result))
        if vision_result.get("usage"):
            print("Usage:", vision_result["usage"])
    else:
        print("Body:", vision_result)


if __name__ == "__main__":
    main()
