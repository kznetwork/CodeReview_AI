import os
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
DATA_DIR = ROOT / "data"
DEFAULT_DB_PATH = DATA_DIR / "app.db"

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
# PRD 기본값. 변경: .env에 OPENROUTER_VISION_MODEL=모델ID (OpenRouter 모델 페이지의 ID)
VISION_MODEL_DEFAULT = "google/gemma-3-27b-it:free"

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
REQUEST_TIMEOUT_S = 120
MAX_RETRIES = 3


def load_dotenv() -> None:
    if not ENV_PATH.is_file():
        return
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def get_api_key() -> str:
    return os.environ.get("OPENROUTER_API_KEY", "").strip()


def get_vision_model() -> str:
    mid = os.environ.get("OPENROUTER_VISION_MODEL", "").strip()
    return mid or VISION_MODEL_DEFAULT


def is_debug() -> bool:
    return os.environ.get("DEBUG", "").strip().lower() in ("1", "true", "yes")


def get_database_url() -> str:
    u = os.environ.get("DATABASE_URL", "").strip()
    if u:
        return u
    DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"


_jwt_secret_cache: str | None = None


def get_jwt_secret() -> str:
    """서명용 비밀. .env의 JWT_SECRET 권장; 없으면 프로세스마다 임시 값(재시작 시 토큰 무효)."""
    global _jwt_secret_cache
    if _jwt_secret_cache:
        return _jwt_secret_cache
    s = os.environ.get("JWT_SECRET", "").strip()
    if s:
        _jwt_secret_cache = s
        return s
    _jwt_secret_cache = secrets.token_hex(32)
    return _jwt_secret_cache


def get_jwt_expire_minutes() -> int:
    try:
        return max(5, int(os.environ.get("JWT_EXPIRE_MINUTES", "10080")))  # 기본 7일
    except ValueError:
        return 10080
