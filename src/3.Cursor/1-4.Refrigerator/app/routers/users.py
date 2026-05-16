"""Current user profile (PRD step 3)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import User
from app.deps import get_current_user
from app.schemas_step3 import UserPublic, UserUpdate

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/me", response_model=UserPublic)
def read_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserPublic)
def update_me(
    data: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if data.display_name is not None:
        user.display_name = data.display_name.strip()
    if data.dietary_notes is not None:
        user.dietary_notes = data.dietary_notes.strip() or None
    if data.default_servings is not None:
        user.default_servings = data.default_servings
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """계정 삭제 시 연관 레시피는 FK CASCADE로 함께 삭제."""
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
