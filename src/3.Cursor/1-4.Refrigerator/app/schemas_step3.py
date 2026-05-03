"""Pydantic schemas for auth and saved recipes (PRD step 3)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, EmailStr, Field

if TYPE_CHECKING:
    from app.db_models import SavedRecipe


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    display_name: str
    dietary_notes: str | None = None
    default_servings: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=100)
    dietary_notes: str | None = None
    default_servings: int | None = Field(None, ge=1, le=20)


class RecipeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    body: dict[str, Any]  # 2단계 레시피 JSON
    ingredients_snapshot: dict[str, Any] | list[Any] | None = None
    vision_model: str | None = Field(None, max_length=200)
    recipe_model: str | None = Field(None, max_length=200)


class RecipeOut(BaseModel):
    id: str
    title: str
    body: dict[str, Any]
    ingredients_snapshot: dict[str, Any] | list[Any] | None = None
    vision_model: str | None = None
    recipe_model: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": False}

    @classmethod
    def from_orm_recipe(cls, r: "SavedRecipe") -> "RecipeOut":
        import json

        body = json.loads(r.body) if isinstance(r.body, str) else r.body
        snap = None
        if r.ingredients_snapshot:
            snap = json.loads(r.ingredients_snapshot)
        return cls(
            id=r.id,
            title=r.title,
            body=body,
            ingredients_snapshot=snap,
            vision_model=r.vision_model,
            recipe_model=r.recipe_model,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )


class RecipeListResponse(BaseModel):
    items: list[RecipeOut]
    total: int
