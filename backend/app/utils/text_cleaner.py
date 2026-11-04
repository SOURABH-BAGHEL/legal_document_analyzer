"""Text normalisation that tidies whitespace/encoding artefacts without altering wording."""

import re
import unicodedata

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_LIGATURES = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl"}
_SPACE_VARIANTS = re.compile(r"[  -   　]")
_ZERO_WIDTH = re.compile(r"[​-‍﻿]")
_QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-"})


def clean_text(text: str) -> str:
    """Normalise extracted text. Words, numbers and punctuation are preserved."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    for lig, rep in _LIGATURES.items():
        text = text.replace(lig, rep)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _ZERO_WIDTH.sub("", text)
    text = _SPACE_VARIANTS.sub(" ", text)
    text = _CONTROL_CHARS.sub("", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_for_match(text: str) -> str:
    """Aggressive normalisation used only for comparing quotes with source text."""
    text = (text or "").translate(_QUOTES).lower()
    text = re.sub(r"[^\w\s%$₹€£.]", " ", text)
    text = text.replace(".", " ")
    return re.sub(r"\s+", " ", text).strip()


def split_sentences(text: str) -> list[str]:
    """Lightweight sentence splitter that avoids breaking on common legal abbreviations."""
    protected = re.sub(
        r"\b(Mr|Mrs|Ms|Dr|No|Rs|Ltd|Pvt|Inc|Co|Corp|Sec|Art|Cl|vs|viz|i\.e|e\.g|etc)\.",
        lambda m: m.group(0).replace(".", "<DOT>"),
        text,
        flags=re.IGNORECASE,
    )
    protected = re.sub(r"(\d)\.(\d)", r"\1<DOT>\2", protected)
    parts = re.split(r"(?<=[.;!?])\s+(?=[\"'(A-Z0-9])|\n{2,}", protected)
    return [p.replace("<DOT>", ".").strip() for p in parts if p and p.strip()]


def truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
