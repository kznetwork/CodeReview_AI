"""``entity.user.User``에 대한 단위 테스트."""

from __future__ import annotations

import pytest

from entity.user import User


def test_user_creation_with_required_fields() -> None:
    """Arrange-Act-Assert: 필수 필드만으로 생성 시 값이 보존된다."""
    # Arrange
    user_id = "user-001"
    display = "Player One"

    # Act
    user = User(user_id=user_id, display_name=display)

    # Assert
    assert user.user_id == user_id
    assert user.display_name == display
    assert user.email is None


def test_user_creation_strips_whitespace() -> None:
    """Arrange-Act-Assert: 앞뒤 공백은 제거된다."""
    # Arrange
    raw_id = "  id-1  "
    raw_name = "  Name  "

    # Act
    user = User(user_id=raw_id, display_name=raw_name)

    # Assert
    assert user.user_id == "id-1"
    assert user.display_name == "Name"


def test_user_creation_with_valid_email() -> None:
    """Arrange-Act-Assert: 유효한 이메일이 보존된다."""
    # Arrange
    email = "player@example.com"

    # Act
    user = User(user_id="u1", display_name="P", email=email)

    # Assert
    assert user.email == email


def test_user_empty_email_string_becomes_none() -> None:
    """Arrange-Act-Assert: 빈 이메일 문자열은 None으로 정규화된다."""
    # Arrange & Act
    user = User(user_id="u1", display_name="P", email="   ")

    # Assert
    assert user.email is None


def test_user_equality_by_user_id_only() -> None:
    """Arrange-Act-Assert: user_id가 같으면 다른 필드여도 동등하다."""
    # Arrange
    a = User(user_id="same", display_name="A", email="a@x.com")
    b = User(user_id="same", display_name="B", email=None)

    # Act & Assert
    assert a == b
    assert hash(a) == hash(b)


def test_user_inequality_different_ids() -> None:
    """Arrange-Act-Assert: user_id가 다르면 동등하지 않다."""
    # Arrange
    a = User(user_id="a", display_name="Same")
    b = User(user_id="b", display_name="Same")

    # Act & Assert
    assert a != b


def test_user_eq_with_non_user_returns_not_implemented() -> None:
    """Arrange-Act-Assert: User가 아니면 NotImplemented를 반환한다."""
    # Arrange
    user = User(user_id="u", display_name="n")

    # Act
    result = user.__eq__("not-a-user")

    # Assert
    assert result is NotImplemented


def test_user_with_display_name_returns_new_instance() -> None:
    """Arrange-Act-Assert: with_display_name은 불변을 유지하고 새 인스턴스를 준다."""
    # Arrange
    original = User(user_id="u1", display_name="Old")

    # Act
    updated = original.with_display_name("New")

    # Assert
    assert updated is not original
    assert original.display_name == "Old"
    assert updated.display_name == "New"
    assert updated.user_id == original.user_id


def test_user_with_email_returns_new_instance() -> None:
    """Arrange-Act-Assert: with_email은 새 인스턴스를 반환한다."""
    # Arrange
    original = User(user_id="u1", display_name="P", email="a@b.co")

    # Act
    cleared = original.with_email(None)

    # Assert
    assert cleared is not original
    assert cleared.email is None
    assert original.email == "a@b.co"


@pytest.mark.parametrize(
    ("user_id", "display_name", "email", "match"),
    [
        ("", "Name", None, "user_id"),
        ("id", "", None, "display_name"),
        ("id", "Name", "bad-email", "email"),
        ("id", "Name", "no-at-symbol.com", "email"),
    ],
)
def test_user_invalid_fields_raise_value_error(
    user_id: str,
    display_name: str,
    email: str | None,
    match: str,
) -> None:
    """Arrange-Act-Assert: 잘못된 필드는 ValueError를 발생시킨다."""
    # Arrange & Act & Assert
    with pytest.raises(ValueError, match=match):
        User(user_id=user_id, display_name=display_name, email=email)
