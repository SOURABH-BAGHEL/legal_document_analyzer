"""Upload validation: extension, declared MIME type, size and file signature ("magic bytes")."""

import io
import zipfile

from app.utils.errors import FileValidationError

ALLOWED_TYPES: dict[str, set[str]] = {
    "pdf": {"application/pdf", "application/x-pdf"},
    "docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    "txt": {"text/plain"},
}
# Browsers/OSes sometimes send a generic type; the signature check below still applies.
GENERIC_MIME_TYPES = {"", "application/octet-stream", "binary/octet-stream"}
MAX_DOCX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024  # zip-bomb guard


def get_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def validate_upload(filename: str, content_type: str | None, data: bytes, max_bytes: int) -> str:
    """Validate an uploaded file and return its normalised type (pdf | docx | txt)."""
    ext = get_extension(filename)
    if ext not in ALLOWED_TYPES:
        raise FileValidationError(
            "Unsupported file format. Please upload a PDF, DOCX or TXT document.",
            code="UNSUPPORTED_FILE_TYPE",
            status_code=415,
        )
    if not data:
        raise FileValidationError("The uploaded file is empty.", code="EMPTY_FILE")
    if len(data) > max_bytes:
        raise FileValidationError(
            f"The file exceeds the maximum allowed size of {max_bytes // (1024 * 1024)} MB.",
            code="FILE_TOO_LARGE",
            status_code=413,
        )

    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in GENERIC_MIME_TYPES and mime not in ALLOWED_TYPES[ext]:
        raise FileValidationError(
            f"The file's content type ({mime}) does not match its .{ext} extension.",
            code="INVALID_MIME_TYPE",
            status_code=415,
        )

    {"pdf": _check_pdf, "docx": _check_docx, "txt": _check_txt}[ext](data)
    return ext


def _check_pdf(data: bytes) -> None:
    if b"%PDF-" not in data[:1024]:
        raise FileValidationError(
            "This file does not appear to be a valid PDF (missing PDF signature).", code="CORRUPTED_FILE"
        )


def _check_docx(data: bytes) -> None:
    corrupted = FileValidationError(
        "This file does not appear to be a valid DOCX document.", code="CORRUPTED_FILE"
    )
    if not data.startswith(b"PK"):
        raise corrupted
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = set(zf.namelist())
            if "word/document.xml" not in names:
                raise corrupted
            if sum(info.file_size for info in zf.infolist()) > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise FileValidationError(
                    "The DOCX archive expands to an unsafe size.", code="UNSAFE_ARCHIVE"
                )
    except zipfile.BadZipFile as exc:
        raise corrupted from exc


def _check_txt(data: bytes) -> None:
    sample = data[:65536]
    has_utf16_bom = sample.startswith((b"\xff\xfe", b"\xfe\xff"))
    if not has_utf16_bom and sample.count(b"\x00") > 0:
        raise FileValidationError(
            "This file contains binary data and is not a plain-text document.", code="CORRUPTED_FILE"
        )
