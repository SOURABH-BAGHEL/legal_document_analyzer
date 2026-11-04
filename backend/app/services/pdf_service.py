"""PDF text extraction with PyMuPDF."""

import logging

import pymupdf

from app.utils.errors import ExtractionError

logger = logging.getLogger(__name__)


def extract_pdf_pages(data: bytes) -> list[str]:
    """Return raw text for each PDF page, in reading order."""
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # PyMuPDF raises several error types for damaged files
        logger.info("PDF open failed: %s", type(exc).__name__)
        raise ExtractionError(
            "The PDF could not be opened. It may be corrupted or not a real PDF file.", code="CORRUPTED_PDF"
        ) from exc

    with doc:
        if doc.needs_pass and not doc.authenticate(""):
            raise ExtractionError(
                "This PDF is password-protected. Please remove the password and upload it again.",
                code="PDF_ENCRYPTED",
            )
        if doc.page_count == 0:
            raise ExtractionError("The PDF contains no pages.", code="EMPTY_PDF")
        pages: list[str] = []
        for page in doc:
            try:
                pages.append(page.get_text("text", sort=True))
            except Exception:  # a single damaged page should not abort the document
                logger.warning("Failed to extract text from page %s", page.number + 1)
                pages.append("")
        return pages
