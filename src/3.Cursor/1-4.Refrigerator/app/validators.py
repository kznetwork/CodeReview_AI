"""Image magic-byte validation and MIME mapping."""

from __future__ import annotations

ALLOWED_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
}


def detect_image_mime(header: bytes) -> str | None:
    if len(header) < 12:
        return None
    if header[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if header[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "image/webp"
    return None
