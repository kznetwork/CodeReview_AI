"""Refrigerator app: step 1 (vision) + step 3 (auth & saved recipes)."""

from __future__ import annotations

import base64
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import MAX_UPLOAD_BYTES, ROOT, get_api_key, get_vision_model, is_debug, load_dotenv
from app.database import init_db
from app.openrouter_client import call_vision
from app.routers import auth, recipes, users
from app.validators import ALLOWED_MIME, detect_image_mime

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Refrigerator", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(recipes.router)


@app.get("/api/config")
async def public_config() -> dict[str, Any]:
    """클라이언트에 노출해도 되는 설정(비밀 없음)."""
    return {
        "vision_model": get_vision_model(),
        "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024),
    }


@app.post("/api/recognize")
async def recognize(file: UploadFile = File(..., description="JPEG/PNG/WebP 이미지")) -> JSONResponse:
    if not get_api_key():
        raise HTTPException(
            status_code=503,
            detail="서버에 OPENROUTER_API_KEY가 설정되어 있지 않습니다. .env를 확인하세요.",
        )

    if not file.filename:
        raise HTTPException(status_code=400, detail="이미지 파일을 선택해 주세요.")

    declared = (file.content_type or "").split(";")[0].strip().lower()
    if declared and declared not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail="JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"파일이 너무 큽니다. 최대 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB까지 허용됩니다.",
        )

    mime = detect_image_mime(raw[:32])
    if mime is None:
        raise HTTPException(
            status_code=400,
            detail="지원하지 않는 이미지 형식입니다. JPEG, PNG, WebP만 허용됩니다.",
        )

    if declared and declared != mime:
        raise HTTPException(
            status_code=400,
            detail="선언된 형식과 실제 파일 내용이 일치하지 않습니다.",
        )

    b64 = base64.standard_b64encode(raw).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"

    try:
        parsed, usage = await call_vision(data_url)
    except RuntimeError as e:
        logger.exception("recognize failed")
        payload: dict[str, Any] = {"ok": False, "error": str(e)}
        if is_debug():
            payload["debug"] = True
        return JSONResponse(status_code=502, content=payload)
    except Exception as e:
        logger.exception("recognize failed")
        payload = {"ok": False, "error": "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."}
        if is_debug():
            payload["debug_detail"] = repr(e)
        return JSONResponse(status_code=500, content=payload)

    ingredients = parsed.get("ingredients") or []
    now = datetime.now(timezone.utc).isoformat()
    out: dict[str, Any] = {
        "ok": True,
        "ingredients": ingredients,
        "raw_summary": parsed.get("raw_summary"),
        "image_meta": {
            "mime": mime,
            "bytes": len(raw),
            "processed_at": now,
        },
        "model": get_vision_model(),
        "usage": usage,
    }

    if not ingredients:
        out["empty_message"] = "식별된 재료가 없습니다. 다른 각도나 밝기로 다시 촬영해 보세요."

    return JSONResponse(content=out)


static_dir = ROOT / "static"
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
