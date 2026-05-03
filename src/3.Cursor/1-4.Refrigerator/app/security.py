"""Password hashing and JWT."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_jwt_expire_minutes, get_jwt_secret

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(sub: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=get_jwt_expire_minutes())
    payload = {"sub": sub, "exp": expire}
    return jwt.encode(payload, get_jwt_secret(), algorithm=ALGORITHM)


def decode_token(token: str) -> str | None:
    try:
        data = jwt.decode(token, get_jwt_secret(), algorithms=[ALGORITHM])
        sub = data.get("sub")
        return str(sub) if sub is not None else None
    except JWTError:
        return None
