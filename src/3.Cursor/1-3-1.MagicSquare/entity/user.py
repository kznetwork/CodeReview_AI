"""애플리케이션 사용자 도메인 엔티티."""

from __future__ import annotations

from dataclasses import dataclass


_MAX_DISPLAY_NAME_LENGTH = 120
_MAX_USER_ID_LENGTH = 64
_MAX_EMAIL_LENGTH = 254


@dataclass(frozen=True, slots=True, eq=False)
class User:
    """매직 스퀘어 애플리케이션의 사용자를 나타내는 불변 엔티티.

    동일성은 ``user_id``만으로 비교한다. 표시 이름·이메일 변경은
    새 인스턴스를 반환하는 메서드로 수행한다.

    Attributes:
        user_id: 시스템 전역에서 유일한 사용자 식별자.
        display_name: UI 등에 표시할 이름.
        email: 연락용 이메일. 없으면 ``None``.
    """

    user_id: str
    display_name: str
    email: str | None = None

    def __post_init__(self) -> None:
        """필드 값을 정규화하고 도메인 규칙을 검증한다.

        Raises:
            ValueError: 식별자·이름·이메일이 규칙을 위반할 때.
        """
        object.__setattr__(self, "user_id", self._normalize_id(self.user_id))
        object.__setattr__(
            self, "display_name", self._normalize_display_name(self.display_name)
        )
        object.__setattr__(self, "email", self._normalize_email(self.email))

    def __eq__(self, other: object) -> bool:
        """동일 엔티티 여부를 ``user_id`` 기준으로 판별한다.

        Args:
            other: 비교 대상 객체.

        Returns:
            ``other``가 ``User``이고 ``user_id``가 같으면 ``True``, 그렇지 않으면
            ``False``. ``User``가 아니면 ``NotImplemented``.
        """
        if not isinstance(other, User):
            return NotImplemented
        return self.user_id == other.user_id

    def __hash__(self) -> int:
        """``user_id`` 기준 해시값을 반환한다.

        Returns:
            엔티티 해시.
        """
        return hash(self.user_id)

    def with_display_name(self, display_name: str) -> User:
        """표시 이름만 바꾼 새 사용자를 반환한다.

        Args:
            display_name: 새 표시 이름.

        Returns:
            ``display_name``만 갱신된 ``User`` 인스턴스.

        Raises:
            ValueError: 이름이 비어 있거나 길이 제한을 넘을 때.
        """
        return User(user_id=self.user_id, display_name=display_name, email=self.email)

    def with_email(self, email: str | None) -> User:
        """이메일만 바꾼 새 사용자를 반환한다.

        Args:
            email: 새 이메일. 제거하려면 ``None`` 또는 빈 문자열.

        Returns:
            ``email``만 갱신된 ``User`` 인스턴스.

        Raises:
            ValueError: 이메일 형식이나 길이가 규칙을 위반할 때.
        """
        return User(
            user_id=self.user_id,
            display_name=self.display_name,
            email=email,
        )

    @staticmethod
    def _normalize_id(raw: str) -> str:
        candidate = raw.strip()
        if not candidate:
            msg = "user_id는 비어 있을 수 없습니다."
            raise ValueError(msg)
        if len(candidate) > _MAX_USER_ID_LENGTH:
            msg = f"user_id는 {_MAX_USER_ID_LENGTH}자 이하여야 합니다."
            raise ValueError(msg)
        return candidate

    @staticmethod
    def _normalize_display_name(raw: str) -> str:
        candidate = raw.strip()
        if not candidate:
            msg = "display_name은 비어 있을 수 없습니다."
            raise ValueError(msg)
        if len(candidate) > _MAX_DISPLAY_NAME_LENGTH:
            msg = f"display_name은 {_MAX_DISPLAY_NAME_LENGTH}자 이하여야 합니다."
            raise ValueError(msg)
        return candidate

    @staticmethod
    def _normalize_email(raw: str | None) -> str | None:
        if raw is None:
            return None
        candidate = raw.strip()
        if candidate == "":
            return None
        if len(candidate) > _MAX_EMAIL_LENGTH:
            msg = f"email은 {_MAX_EMAIL_LENGTH}자 이하여야 합니다."
            raise ValueError(msg)
        if "@" not in candidate:
            msg = "email에는 '@'가 포함되어야 합니다."
            raise ValueError(msg)
        return candidate
