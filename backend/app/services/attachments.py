"""Attachment intake: validate type/size and extract text. Nothing here calls a model.

Documents are reduced to plain text (kept locally in SQLite); images are kept as base64 for vision models.
"""
from __future__ import annotations

import base64
import binascii
import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import PurePath

from app.core.errors import AppError

MAX_DOC_BYTES = 15 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_TEXT_CHARS = 60_000  # per attachment, after extraction

IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}
TEXT_EXT = {
    ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".log",
    ".xml", ".html", ".htm", ".css", ".scss", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".ipynb", ".java",
    ".kt", ".c", ".h", ".cpp", ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".sql", ".sh", ".bat", ".ps1",
    ".r", ".lua", ".dart", ".vue", ".svelte", ".tex", ".rst", ".env.example", ".gitignore", ".dockerfile",
}
DOC_TYPES = {".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
SUPPORTED_HINT = "text, code, Markdown, CSV, JSON, PDF, Word (.docx) and PNG/JPEG/WebP/GIF images"


@dataclass
class Extracted:
    kind: str  # text | image
    mime: str
    size: int
    text: str | None = None
    data_b64: str | None = None
    pages: int | None = None
    truncated: bool = False
    ocr: bool = False  # text came from optical character recognition


def _ext(name: str) -> str:
    n = name.lower()
    for multi in (".env.example",):
        if n.endswith(multi):
            return multi
    return PurePath(n).suffix


def _decode_text(raw: bytes) -> str:
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):  # UTF-16 only with a BOM; otherwise it "decodes" anything
        try:
            return raw.decode("utf-16")
        except UnicodeDecodeError:
            pass
    if b"\x00" in raw[:4096]:
        raise AppError(415, "unsupported_file", "This looks like a binary file, not text.")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


MIN_PAGE_CHARS = 25  # less than this on a page means it is probably a scanned image
MAX_OCR_PAGES = 40


def _page_ocr(page) -> str:  # noqa: ANN001
    """OCR the images embedded in one PDF page (a scanned page is usually a single full-page image)."""
    from app.services import ocr
    parts = []
    for img in page.images:
        try:
            buf = io.BytesIO()
            img.image.save(buf, "PNG")
            text = ocr.recognize(buf.getvalue())
        except ocr.OcrUnavailable:
            raise
        except Exception:  # noqa: BLE001 - one undecodable image shouldn't fail the whole file
            continue
        if text:
            parts.append(text)
    return "\n".join(parts)


def _pdf_text(raw: bytes) -> tuple[str, int, bool]:
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover - dependency is declared in pyproject
        raise AppError(500, "pdf_unavailable", "PDF support is not installed (pypdf).") from None
    try:
        reader = PdfReader(io.BytesIO(raw))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:  # noqa: BLE001
                raise AppError(422, "pdf_encrypted", "This PDF is password-protected.") from None
        parts, used_ocr, ocr_error = [], False, None
        for i, page in enumerate(reader.pages, 1):
            t = (page.extract_text() or "").strip()
            if len(t) < MIN_PAGE_CHARS and i <= MAX_OCR_PAGES and ocr_error is None:
                try:
                    o = _page_ocr(page)
                except Exception as exc:  # noqa: BLE001 - OcrUnavailable or engine failure
                    ocr_error = str(exc)
                    o = ""
                if len(o) > len(t):
                    t, used_ocr = o, True
            if t:
                parts.append(f"[Page {i}]\n{t}")
        if not parts and ocr_error:
            raise AppError(422, "no_text", f"No text layer in this PDF and text recognition failed: {ocr_error}")
        return "\n\n".join(parts), len(reader.pages), used_ocr
    except AppError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise AppError(422, "extraction_failed", f"Could not read this PDF ({type(exc).__name__}).") from None


_W_P = re.compile(r"</w:p>")
_W_T = re.compile(r"<w:t[^>]*>([^<]*)</w:t>")
_W_TAB = re.compile(r"<w:tab/>")


def _docx_text(raw: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            xml = z.read("word/document.xml").decode("utf-8", "replace")
    except (zipfile.BadZipFile, KeyError):
        raise AppError(422, "extraction_failed", "Could not read this Word document.") from None
    paras = []
    for chunk in _W_P.split(_W_TAB.sub("<w:t>\t</w:t>", xml)):
        line = "".join(_W_T.findall(chunk))
        if line.strip():
            paras.append(line)
    import html
    return html.unescape("\n".join(paras))


def extract(name: str, mime: str, data_b64: str) -> Extracted:
    try:
        raw = base64.b64decode(data_b64, validate=True)
    except (binascii.Error, ValueError):
        raise AppError(422, "bad_upload", "The file data could not be decoded.") from None
    size = len(raw)
    if size == 0:
        raise AppError(422, "empty_file", "The file is empty.")
    ext = _ext(name)

    if ext in IMAGE_TYPES:
        if size > MAX_IMAGE_BYTES:
            raise AppError(413, "file_too_large", f"Images must be under {MAX_IMAGE_BYTES // (1024 * 1024)} MB.")
        # Best-effort OCR so models without vision still get any text in the picture.
        try:
            from app.services import ocr
            text = ocr.recognize(raw)[:MAX_TEXT_CHARS] or None
        except Exception:  # noqa: BLE001 - OCR is optional for images
            text = None
        return Extracted("image", IMAGE_TYPES[ext], size, text=text, data_b64=base64.b64encode(raw).decode(), ocr=bool(text))

    if size > MAX_DOC_BYTES:
        raise AppError(413, "file_too_large", f"Files must be under {MAX_DOC_BYTES // (1024 * 1024)} MB.")
    pages, used_ocr = None, False
    if ext == ".pdf":
        text, pages, used_ocr = _pdf_text(raw)
        out_mime = DOC_TYPES[ext]
    elif ext == ".docx":
        text, out_mime = _docx_text(raw), DOC_TYPES[ext]
    elif ext in TEXT_EXT or (mime.startswith("text/") and ext not in (".rtf",)):
        text, out_mime = _decode_text(raw), (mime or "text/plain")
    else:
        raise AppError(415, "unsupported_file", f"Unsupported file type. FRIDAY can read {SUPPORTED_HINT}.")

    text = text.replace("\r\n", "\n").strip()
    if not text:
        raise AppError(422, "no_text", "No readable text was found in this file"
                       + (" — even text recognition found nothing readable." if ext == ".pdf" else "."))
    truncated = len(text) > MAX_TEXT_CHARS
    return Extracted("text", out_mime, size, text=text[:MAX_TEXT_CHARS], pages=pages, truncated=truncated, ocr=used_ocr)


def as_prompt_block(name: str, text: str, pages: int | None, truncated: bool, ocr: bool = False) -> str:
    """How an extracted document is presented to the model inside the user turn."""
    meta = (f' pages="{pages}"' if pages else "") + (' source="text recognition (may contain errors)"' if ocr else "")
    note = "\n[Content truncated: only the beginning of the file is included.]" if truncated else ""
    return f'<attachment name="{name}"{meta}>\n{text}{note}\n</attachment>'
