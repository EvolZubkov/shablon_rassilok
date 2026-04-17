"""
Generate multi-source Win32 ICO from artboard PNG files.

Each ICO frame is sampled from the artboard whose native size is the
smallest one that is >= the target size, which keeps downscaling
minimal and avoids upscaling artefacts.  Frames >= 256 px are stored
as lossless PNG chunks (Vista+ standard); smaller frames are stored
as 32-bpp BMP data for broadest compatibility.

The ICO binary is assembled manually because Pillow's ICO save only
accepts a single source image and cannot combine frames from different
source PNGs.

Usage:
    python scripts/convert_icon.py --ico assets/icon.ico
    python scripts/convert_icon.py --ico assets/icon.ico --png dist/linux/icon.png

@module convert_icon
"""

from __future__ import annotations

import argparse
import io
import struct
from pathlib import Path

from PIL import Image, BmpImagePlugin  # noqa: F401 – BMP plugin must be registered


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# Available artboard PNGs mapped to their native pixel dimensions (square).
# Listed so selection logic can find the smallest >= target quickly.
ARTBOARDS: list[tuple[int, Path]] = [
    (16,  ASSETS / "Монтажная область 116px.png"),
    (24,  ASSETS / "Монтажная область 124px.png"),
    (32,  ASSETS / "Монтажная область 132px.png"),
    (48,  ASSETS / "Монтажная область 148px.png"),
    (64,  ASSETS / "Монтажная область 164px.png"),
    (128, ASSETS / "Монтажная область 1128px.png"),
    (256, ASSETS / "Монтажная область 1256px.png"),
    (512, ASSETS / "Монтажная область 1512px.png"),
    (500, ASSETS / "Монтажная область 1.png"),
]

# Win32 ICO target frame sizes.
ICO_SIZES: list[int] = [16, 24, 32, 48, 64, 128, 256]

# PNG chunk threshold: frames at or above this size are stored as PNG.
PNG_THRESHOLD: int = 256

# Default resolution for the standalone PNG export.
PNG_EXPORT_SIZE: int = 256


# ---------------------------------------------------------------------------
# Source selection
# ---------------------------------------------------------------------------

def _best_artboard(target: int) -> Image.Image:
    """Return the RGBA artboard best suited for *target* pixels.

    Selects the smallest artboard whose native size is >= *target*,
    guaranteeing a pure downscale.  Falls back to the largest available
    artboard when none is large enough.

    :param target: Desired output size in pixels (one side of a square).
    :return: RGBA source image.
    :raises FileNotFoundError: When no artboard file exists on disk.
    """
    available = [(s, p) for s, p in ARTBOARDS if p.exists()]
    if not available:
        raise FileNotFoundError("No artboard PNG files found in the repository root")
    candidates = [(s, p) for s, p in available if s >= target]
    _, path = min(candidates, key=lambda x: x[0]) if candidates else max(available, key=lambda x: x[0])
    return Image.open(path).convert("RGBA")


def _make_frame(size: int) -> Image.Image:
    """Produce a *size* x *size* RGBA frame from the best artboard.

    Returns the source unchanged when it is already the exact size;
    otherwise applies LANCZOS resampling.

    :param size: Target frame size in pixels.
    :return: Resized RGBA image.
    """
    src = _best_artboard(size)
    if src.width == size and src.height == size:
        return src.copy()
    frame = src.copy()
    frame.thumbnail((size, size), Image.Resampling.LANCZOS)
    return frame


# ---------------------------------------------------------------------------
# ICO encoding helpers
# ---------------------------------------------------------------------------

def _encode_png_chunk(img: Image.Image) -> bytes:
    """Encode *img* as a PNG byte string for embedding in an ICO file.

    :param img: RGBA image to encode.
    :return: Raw PNG bytes.
    """
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)
    return buf.getvalue()


def _encode_bmp_chunk(img: Image.Image) -> bytes:
    """Encode *img* as a 32-bpp DIBV3 chunk suitable for an ICO frame.

    The chunk is a BMP file body **without** the 14-byte file header and
    with the height field doubled (ICO convention for XOR+AND masks stored
    together, even though we only carry the colour data).

    :param img: RGBA image to encode.
    :return: Raw DIB bytes.
    """
    w, h = img.size
    # Build a minimal BMP in memory and strip the 14-byte file header.
    buf = io.BytesIO()
    # BITMAPINFOHEADER (40 bytes)
    header = struct.pack(
        "<IiiHHIIiiII",
        40,          # biSize
        w,           # biWidth
        h * 2,       # biHeight doubled (XOR + AND masks convention)
        1,           # biPlanes
        32,          # biBitCount
        0,           # biCompression = BI_RGB
        0,           # biSizeImage (0 = calculated by reader)
        0, 0,        # biXPels, biYPels
        0, 0,        # biClrUsed, biClrImportant
    )
    buf.write(header)
    # Pixel data: 32-bpp BGRA, bottom-up row order.
    rgba = img.tobytes("raw", "RGBA")
    # Convert RGBA -> BGRA and flip rows.
    row_size = w * 4
    rows = [rgba[y * row_size:(y + 1) * row_size] for y in range(h)]
    for row in reversed(rows):
        # Swap R and B channels.
        bgra_row = bytearray(row_size)
        for x in range(w):
            bgra_row[x * 4 + 0] = row[x * 4 + 2]  # B
            bgra_row[x * 4 + 1] = row[x * 4 + 1]  # G
            bgra_row[x * 4 + 2] = row[x * 4 + 0]  # R
            bgra_row[x * 4 + 3] = row[x * 4 + 3]  # A
        buf.write(bgra_row)
    # AND mask: all zeros (fully opaque via alpha channel).
    mask_row_size = ((w + 31) // 32) * 4
    buf.write(b"\x00" * mask_row_size * h)
    return buf.getvalue()


def _build_ico(frames: list[Image.Image]) -> bytes:
    """Assemble a multi-frame ICO binary from a list of RGBA images.

    Frames at or above :data:`PNG_THRESHOLD` pixels are stored as PNG
    chunks; smaller frames use 32-bpp DIB encoding.

    :param frames: List of RGBA images, one per ICO frame.
    :return: Complete ICO file contents as bytes.
    """
    chunks: list[bytes] = []
    for img in frames:
        if img.width >= PNG_THRESHOLD:
            chunks.append(_encode_png_chunk(img))
        else:
            chunks.append(_encode_bmp_chunk(img))

    count = len(frames)
    # ICO header: 6 bytes.
    header = struct.pack("<HHH", 0, 1, count)
    # Directory entries: 16 bytes each.
    # Image data starts after header + directory.
    data_offset = 6 + count * 16
    directory = bytearray()
    for img, chunk in zip(frames, chunks):
        w = img.width if img.width < 256 else 0   # 0 means 256 in ICO spec
        h = img.height if img.height < 256 else 0
        entry = struct.pack(
            "<BBBBHHII",
            w,             # bWidth
            h,             # bHeight
            0,             # bColorCount (0 = true color)
            0,             # bReserved
            1,             # wPlanes
            32,            # wBitCount
            len(chunk),    # dwBytesInRes
            data_offset,   # dwImageOffset
        )
        directory += entry
        data_offset += len(chunk)

    return header + bytes(directory) + b"".join(chunks)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def write_ico(target: Path) -> None:
    """Write a multi-frame Win32 ICO file to *target*.

    Each frame is independently sourced from the most appropriate
    artboard PNG to maximise sharpness at every size.

    :param target: Destination ``.ico`` file path.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    frames = [_make_frame(s) for s in ICO_SIZES]
    ico_bytes = _build_ico(frames)
    target.write_bytes(ico_bytes)


def write_png(target: Path, size: int = PNG_EXPORT_SIZE) -> None:
    """Write a single PNG icon of *size* x *size* pixels to *target*.

    :param target: Destination ``.png`` file path.
    :param size: Output resolution in pixels.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    img = _best_artboard(size)
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    img.save(target, format="PNG")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    """Entry point: parse CLI arguments and generate requested outputs."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--ico", type=Path, default=None, help="Output .ico path")
    parser.add_argument("--png", type=Path, default=None, help="Output .png path")
    args = parser.parse_args()

    if args.ico is None and args.png is None:
        parser.error("Specify at least one of --ico or --png")

    if args.ico is not None:
        write_ico(args.ico)
        sizes_label = ", ".join(f"{s}x{s}" for s in ICO_SIZES)
        print(f"[OK] {args.ico}  ({sizes_label})")

    if args.png is not None:
        write_png(args.png)
        print(f"[OK] {args.png}  ({PNG_EXPORT_SIZE}x{PNG_EXPORT_SIZE})")


if __name__ == "__main__":
    main()
