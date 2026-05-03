"""OpenRouter chat completions (vision) with retries and JSON extraction."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import httpx

from app.config import (
    MAX_RETRIES,
    OPENROUTER_URL,
    REQUEST_TIMEOUT_S,
    get_api_key,
    get_vision_model,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You analyze refrigerator or pantry photos.
Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{
  "ingredients": [
    { "name": string, "confidence": "high" | "medium" | "low", "note": string or null }
  ],
  "raw_summary": string or null
}
Rules:
- List only items that appear edible (food, condiments, packaged food). Skip containers unless the food inside is identifiable.
- Use concise names in Korean when the packaging/labels are Korean; otherwise Korean or common English food names.
- If nothing edible is visible, use "ingredients": [] and briefly explain in raw_summary.
"""


USER_PROMPT = "이 이미지에서 보이는 식재료·조미료·가공식품만 위 JSON 스키마로 출력하세요."

RETRY_STATUS = {429, 502, 503, 504}


def _extract_json_text(content: str) -> str:
    text = content.strip()
    fence = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", text, re.DOTALL | re.IGNORECASE)
    if fence:
        return fence.group(1).strip()
    return text


def parse_ingredient_response(content: str) -> dict[str, Any]:
    raw = _extract_json_text(content)
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("root must be object")
    ingredients = data.get("ingredients")
    if not isinstance(ingredients, list):
        raise ValueError("ingredients must be array")
    cleaned = []
    for item in ingredients:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not name or not isinstance(name, str):
            continue
        conf = item.get("confidence", "medium")
        if conf not in ("high", "medium", "low"):
            conf = "medium"
        note = item.get("note")
        if note is not None and not isinstance(note, str):
            note = str(note)
        cleaned.append({"name": name.strip(), "confidence": conf, "note": note})
    out: dict[str, Any] = {"ingredients": cleaned, "raw_summary": data.get("raw_summary")}
    if out["raw_summary"] is not None and not isinstance(out["raw_summary"], str):
        out["raw_summary"] = str(out["raw_summary"])
    return out


async def call_vision(data_url: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Returns (parsed_payload, usage_meta)."""
    key = get_api_key()
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY가 설정되어 있지 않습니다.")

    payload = {
        "model": get_vision_model(),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": USER_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ],
        "max_tokens": 1024,
        "temperature": 0.2,
    }

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/local/refrigerator",
        "X-OpenRouter-Title": "Refrigerator Step1",
    }

    last_exc: Exception | None = None
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
        for attempt in range(MAX_RETRIES):
            try:
                r = await client.post(OPENROUTER_URL, headers=headers, json=payload)
                if r.status_code == 401:
                    raise RuntimeError(
                        "OpenRouter가 API 키를 거부했습니다. .env의 OPENROUTER_API_KEY를 확인하세요."
                    )
                if r.status_code in RETRY_STATUS and attempt < MAX_RETRIES - 1:
                    wait = 2**attempt
                    logger.warning("OpenRouter %s, retry in %ss", r.status_code, wait)
                    await asyncio.sleep(wait)
                    continue
                if r.status_code >= 400:
                    try:
                        err = r.json()
                        msg = err.get("error", {}).get("message", r.text[:400])
                    except Exception:
                        msg = r.text[:400]
                    raise RuntimeError(f"OpenRouter 오류 ({r.status_code}): {msg}")

                body = r.json()
                msg = body["choices"][0]["message"]["content"]
                if not isinstance(msg, str):
                    raise ValueError("unexpected message content type")
                parsed = parse_ingredient_response(msg)
                usage = body.get("usage") or {}
                return parsed, usage
            except (json.JSONDecodeError, ValueError, KeyError) as e:
                last_exc = e
                logger.warning("parse failed, retry: %s", e)
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(1)
                    continue
                raise RuntimeError("모델 응답을 JSON으로 해석하지 못했습니다. 잠시 후 다시 시도해 주세요.") from e
            except httpx.RequestError as e:
                last_exc = e
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(2**attempt)
                    continue
                raise RuntimeError(f"네트워크 오류: {e}") from e

    if last_exc:
        raise last_exc
    raise RuntimeError("OpenRouter 호출에 실패했습니다.")
