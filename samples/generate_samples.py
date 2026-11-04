"""Render the fictional sample agreement as PDF and DOCX for upload testing.

Usage (from the project root, using the backend virtualenv):
    backend/.venv/Scripts/python samples/generate_samples.py      # Windows
    backend/.venv/bin/python samples/generate_samples.py          # macOS / Linux
"""

from pathlib import Path

import pymupdf
from docx import Document
from docx.shared import Pt

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "sample_rental_agreement.txt"


def paragraphs() -> list[str]:
    return [p.strip() for p in SOURCE.read_text(encoding="utf-8").split("\n\n") if p.strip()]


def build_docx(out: Path) -> None:
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    for para in paragraphs():
        if para.isupper() and len(para) < 60:
            doc.add_heading(para.title(), level=1)
        else:
            doc.add_paragraph(para)
    doc.save(out)


def build_pdf(out: Path) -> None:
    pdf = pymupdf.open()
    width, height, margin = 595, 842, 56  # A4 in points
    page = pdf.new_page(width=width, height=height)
    y = margin
    for para in paragraphs():
        is_heading = para.isupper() and len(para) < 60
        font_size = 13 if is_heading else 10.5
        if y > height - margin - 30:
            page = pdf.new_page(width=width, height=height)
            y = margin
        rect = pymupdf.Rect(margin, y, width - margin, height - margin)
        # Measure by inserting into a scratch page first.
        scratch = pymupdf.open()
        sp = scratch.new_page(width=width, height=height)
        spare = sp.insert_textbox(rect, para, fontsize=font_size, fontname="hebo" if is_heading else "helv")
        scratch.close()
        if spare < 0:  # does not fit on the current page
            page = pdf.new_page(width=width, height=height)
            y = margin
            rect = pymupdf.Rect(margin, y, width - margin, height - margin)
            spare = page.insert_textbox(rect, para, fontsize=font_size, fontname="hebo" if is_heading else "helv")
        else:
            page.insert_textbox(rect, para, fontsize=font_size, fontname="hebo" if is_heading else "helv")
        used = (height - margin - y) - spare
        y += used + 10
    pdf.set_metadata({"title": "Fictional Sample Residential Rental Agreement", "subject": "Demonstration only"})
    pdf.save(out)


if __name__ == "__main__":
    build_docx(HERE / "sample_rental_agreement.docx")
    build_pdf(HERE / "sample_rental_agreement.pdf")
    print("Generated sample_rental_agreement.docx and sample_rental_agreement.pdf")
