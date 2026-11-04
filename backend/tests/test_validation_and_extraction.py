import io
from pathlib import Path

import pymupdf
import pytest
from docx import Document as DocxDocument

from app.services.chunking_service import build_chunks
from app.services.text_extraction_service import extract_text
from app.utils.errors import AppError, ExtractionError, FileValidationError
from app.utils.file_validator import validate_upload
from app.utils.security import generate_storage_name, resolve_storage_path, sanitize_display_name
from app.utils.text_cleaner import clean_text

MB = 1024 * 1024


def _pdf(pages: list[str], password: str | None = None) -> bytes:
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        if text:
            page.insert_textbox(pymupdf.Rect(50, 50, 550, 800), text, fontsize=11)
    buf = io.BytesIO()
    if password:
        doc.save(buf, encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw=password, owner_pw=password)
    else:
        doc.save(buf)
    return buf.getvalue()


LEGAL_TEXT = "The Tenant shall pay the monthly rent on or before the fifth day of each month. " * 5


# --- upload validation -------------------------------------------------------


@pytest.mark.parametrize("name", ["contract.exe", "contract.jpg", "contract", "contract.pdf.js"])
def test_rejects_unsupported_extensions(name):
    with pytest.raises(FileValidationError) as exc:
        validate_upload(name, "application/octet-stream", b"data", MB)
    assert exc.value.code == "UNSUPPORTED_FILE_TYPE"


def test_rejects_empty_file():
    with pytest.raises(FileValidationError) as exc:
        validate_upload("a.txt", "text/plain", b"", MB)
    assert exc.value.code == "EMPTY_FILE"


def test_rejects_oversized_file():
    with pytest.raises(FileValidationError) as exc:
        validate_upload("a.txt", "text/plain", b"a" * (MB + 1), MB)
    assert exc.value.code == "FILE_TOO_LARGE"
    assert exc.value.status_code == 413


def test_rejects_mime_mismatch():
    with pytest.raises(FileValidationError) as exc:
        validate_upload("a.pdf", "image/png", b"%PDF-1.7 ...", MB)
    assert exc.value.code == "INVALID_MIME_TYPE"


def test_rejects_fake_pdf_and_docx():
    with pytest.raises(FileValidationError):
        validate_upload("a.pdf", "application/pdf", b"just text pretending", MB)
    with pytest.raises(FileValidationError):
        validate_upload("a.docx", "application/octet-stream", b"PK\x03\x04garbage", MB)


def test_rejects_binary_txt():
    with pytest.raises(FileValidationError):
        validate_upload("a.txt", "text/plain", b"MZ\x90\x00\x03\x00binary", MB)


def test_accepts_valid_files(sample_pdf, sample_docx, sample_txt):
    assert validate_upload("x.pdf", "application/pdf", sample_pdf, 20 * MB) == "pdf"
    assert validate_upload("x.docx", "application/octet-stream", sample_docx, 20 * MB) == "docx"
    assert validate_upload("x.TXT", "text/plain; charset=utf-8", sample_txt, 20 * MB) == "txt"


# --- security helpers --------------------------------------------------------


def test_display_name_is_sanitised():
    assert sanitize_display_name("../../etc/passwd") == "passwd"
    assert sanitize_display_name("C:\\Users\\x\\lease<1>.pdf") == "lease_1_.pdf"
    assert sanitize_display_name("") == "document"


def test_storage_names_are_random_and_safe():
    a, b = generate_storage_name("pdf"), generate_storage_name("pdf")
    assert a != b and a.endswith(".pdf") and "/" not in a
    with pytest.raises(AppError):
        generate_storage_name("../x")


def test_path_traversal_is_blocked(tmp_path: Path):
    assert resolve_storage_path(tmp_path, "abc.pdf").parent == tmp_path.resolve()
    with pytest.raises(AppError) as exc:
        resolve_storage_path(tmp_path, "../outside.pdf")
    assert exc.value.code == "PATH_TRAVERSAL"


# --- extraction --------------------------------------------------------------


def test_extracts_all_sample_formats(sample_pdf, sample_docx, sample_txt):
    for file_type, data, unit in (("pdf", sample_pdf, "page"), ("docx", sample_docx, "section"), ("txt", sample_txt, "section")):
        result = extract_text(file_type, data)
        joined = " ".join(result.pages)
        assert result.location_unit == unit
        assert "Arjun Mehta" in joined and "Rs. 25,000" in joined
        assert "FICTIONAL SAMPLE DOCUMENT" in joined


def test_docx_tables_are_extracted():
    doc = DocxDocument()
    doc.add_paragraph(LEGAL_TEXT)
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Monthly rent"
    table.rows[0].cells[1].text = "Rs. 12,000"
    buf = io.BytesIO()
    doc.save(buf)
    result = extract_text("docx", buf.getvalue())
    assert "Monthly rent | Rs. 12,000" in result.pages[0]


def test_corrupted_pdf():
    with pytest.raises(ExtractionError) as exc:
        extract_text("pdf", b"%PDF-1.7\nthis is not really a pdf body")
    assert exc.value.code == "CORRUPTED_PDF"


def test_password_protected_pdf():
    with pytest.raises(ExtractionError) as exc:
        extract_text("pdf", _pdf([LEGAL_TEXT], password="secret"))
    assert exc.value.code == "PDF_ENCRYPTED"


def test_scanned_or_blank_pdf_reports_ocr_limitation():
    with pytest.raises(ExtractionError) as exc:
        extract_text("pdf", _pdf(["", ""]))
    assert exc.value.code == "NO_EXTRACTABLE_TEXT"
    assert "OCR" in exc.value.message


def test_partially_blank_pdf_produces_warning():
    result = extract_text("pdf", _pdf([LEGAL_TEXT, ""]))
    assert result.warnings and "Page(s) 2" in result.warnings[0]


def test_empty_txt_rejected():
    with pytest.raises(ExtractionError) as exc:
        extract_text("txt", b"   \n\n  ")
    assert exc.value.code == "EMPTY_DOCUMENT"


def test_clean_text_preserves_wording():
    raw = "The  Lessee\u00a0shall   remit\r\n\r\n\r\n\r\nthe ﬁxed rent."
    assert clean_text(raw) == "The Lessee shall remit\n\nthe fixed rent."


# --- chunking ----------------------------------------------------------------


def test_chunking_overlap_page_markers_and_truncation_notice():
    pages = [f"Clause {i}. " + ("word " * 400) for i in range(1, 21)]
    plan = build_chunks(pages, "page", chunk_size=4000, overlap=500, max_chunks=3)
    assert len(plan.chunks) == 3
    assert plan.truncated and plan.notes and "NOT reviewed" in plan.notes[0]
    assert plan.chunks[0].text.startswith("[Page 1]")
    assert plan.chunks[1].page_start <= plan.chunks[0].page_end  # overlap carries content forward


def test_short_document_is_single_chunk_without_truncation():
    plan = build_chunks(["short text"], "section")
    assert len(plan.chunks) == 1 and not plan.truncated
    assert plan.chunks[0].text.startswith("[Section 1]")
