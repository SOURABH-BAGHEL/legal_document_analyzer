"""File-handling safety helpers: safe names, path containment, display-name sanitising."""

import hashlib
import re
import unicodedata
from pathlib import Path
from uuid import uuid4

from app.utils.errors import AppError

_UNSAFE_DISPLAY_CHARS = re.compile(r"[\x00-\x1f\x7f<>:\"/\\|?*]")


def generate_storage_name(extension: str) -> str:
    """Random internal filename. User input never influences the stored path."""
    if not re.fullmatch(r"[a-z0-9]{1,5}", extension):
        raise AppError("Invalid file extension.", code="INVALID_EXTENSION")
    return f"{uuid4().hex}.{extension}"


def sanitize_display_name(filename: str | None, max_length: int = 200) -> str:
    """Strip directory components and control characters from a user-supplied filename."""
    name = (filename or "").replace("\\", "/").split("/")[-1]
    name = unicodedata.normalize("NFC", name)
    name = _UNSAFE_DISPLAY_CHARS.sub("_", name).strip(" .")
    if not name:
        name = "document"
    if len(name) > max_length:
        stem, dot, ext = name.rpartition(".")
        name = (stem[: max_length - len(ext) - 1] + "." + ext) if dot else name[:max_length]
    return name


def resolve_storage_path(storage_dir: Path, reference: str) -> Path:
    """Resolve a stored reference and guarantee it stays inside the storage directory."""
    base = storage_dir.resolve()
    candidate = (base / reference).resolve()
    if base != candidate.parent and base not in candidate.parents:
        raise AppError("Invalid file reference.", code="PATH_TRAVERSAL", status_code=400)
    return candidate


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
