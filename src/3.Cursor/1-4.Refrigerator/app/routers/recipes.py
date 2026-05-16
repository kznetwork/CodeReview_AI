"""Saved recipes CRUD (PRD step 3)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import SavedRecipe, User
from app.deps import get_current_user
from app.schemas_step3 import RecipeCreate, RecipeListResponse, RecipeOut

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@router.post("", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe(
    data: RecipeCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecipeOut:
    rid = str(uuid.uuid4())
    snap_str = json.dumps(data.ingredients_snapshot, ensure_ascii=False) if data.ingredients_snapshot is not None else None
    row = SavedRecipe(
        id=rid,
        user_id=user.id,
        title=data.title.strip(),
        body=json.dumps(data.body, ensure_ascii=False),
        ingredients_snapshot=snap_str,
        vision_model=data.vision_model,
        recipe_model=data.recipe_model,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return RecipeOut.from_orm_recipe(row)


@router.get("", response_model=RecipeListResponse)
def list_recipes(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    q: str | None = Query(None, max_length=200),
) -> RecipeListResponse:
    base = select(SavedRecipe).where(SavedRecipe.user_id == user.id, SavedRecipe.deleted_at.is_(None))
    count_q = select(func.count()).select_from(SavedRecipe).where(
        SavedRecipe.user_id == user.id,
        SavedRecipe.deleted_at.is_(None),
    )
    if q:
        base = base.where(SavedRecipe.title.ilike(f"%{q.strip()}%"))
        count_q = count_q.where(SavedRecipe.title.ilike(f"%{q.strip()}%"))
    total = int(db.scalar(count_q) or 0)
    rows = db.scalars(base.order_by(SavedRecipe.created_at.desc()).offset(skip).limit(limit)).all()
    return RecipeListResponse(items=[RecipeOut.from_orm_recipe(r) for r in rows], total=total)


@router.get("/{recipe_id}", response_model=RecipeOut)
def get_recipe(
    recipe_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecipeOut:
    row = db.get(SavedRecipe, recipe_id)
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="레시피를 찾을 수 없습니다.")
    if row.user_id != user.id:
        raise HTTPException(status_code=403, detail="이 레시피에 접근할 수 없습니다.")
    return RecipeOut.from_orm_recipe(row)


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(
    recipe_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    row = db.get(SavedRecipe, recipe_id)
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="레시피를 찾을 수 없습니다.")
    if row.user_id != user.id:
        raise HTTPException(status_code=403, detail="이 레시피에 접근할 수 없습니다.")
    row.deleted_at = utcnow()
    db.add(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
