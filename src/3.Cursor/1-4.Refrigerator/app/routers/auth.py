"""Register and login (PRD step 3)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import User
from app.schemas_step3 import TokenResponse, UserLogin, UserPublic, UserRegister
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(data: UserRegister, db: Session = Depends(get_db)) -> User:
    exists = db.scalar(select(User).where(User.email == data.email))
    if exists:
        raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다.")
    user = User(
        email=data.email.lower().strip(),
        password_hash=hash_password(data.password),
        display_name=data.display_name.strip(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == data.email.lower().strip()))
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)
