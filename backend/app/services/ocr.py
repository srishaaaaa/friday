"""Offline text recognition using the OCR engine built into Windows (Windows.Media.Ocr). Nothing leaves the PC.

Works on PNG/JPEG/etc. bytes; images are normalised through Pillow first. Unavailable on non-Windows systems or
when the winrt packages are missing — callers get OcrUnavailable and report it honestly.
"""
from __future__ import annotations

import asyncio
import io
import threading


class OcrUnavailable(Exception):
    pass


_lock = threading.Lock()


def available() -> bool:
    try:
        from winrt.windows.media.ocr import OcrEngine  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError:
        return False
    return True


def _normalise(data: bytes) -> bytes:
    """Any Pillow-readable image → RGB PNG within the engine's size limit; upscale tiny scans for accuracy."""
    from PIL import Image
    from winrt.windows.media.ocr import OcrEngine
    img = Image.open(io.BytesIO(data))
    img = img.convert("RGB")
    limit = int(OcrEngine.max_image_dimension) or 10000
    w, h = img.size
    scale = 1.0
    if max(w, h) > limit:
        scale = limit / max(w, h)
    elif max(w, h) < 1000:
        scale = min(2.5, 1600 / max(w, h))
    if scale != 1.0:
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))))
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


async def _recognize(png: bytes) -> str:
    from winrt.windows.graphics.imaging import BitmapDecoder
    from winrt.windows.media.ocr import OcrEngine
    from winrt.windows.storage.streams import DataWriter, InMemoryRandomAccessStream
    engine = OcrEngine.try_create_from_user_profile_languages()
    if engine is None:
        raise OcrUnavailable("No Windows OCR language is installed (Settings → Time & language → Language).")
    stream = InMemoryRandomAccessStream()
    writer = DataWriter(stream)
    writer.write_bytes(png)
    await writer.store_async()
    await writer.flush_async()
    writer.detach_stream()
    stream.seek(0)
    bitmap = await (await BitmapDecoder.create_async(stream)).get_software_bitmap_async()
    result = await engine.recognize_async(bitmap)
    return "\n".join(line.text for line in result.lines)


def recognize(data: bytes) -> str:
    """Synchronous OCR of one image (call from a worker thread, not the event loop)."""
    if not available():
        raise OcrUnavailable("Text recognition isn't available on this system.")
    try:
        png = _normalise(data)
    except Exception as exc:  # noqa: BLE001
        raise OcrUnavailable(f"Could not read the image for text recognition ({type(exc).__name__}).") from None
    with _lock:  # the WinRT engine is used from one thread at a time
        return asyncio.run(_recognize(png)).strip()
