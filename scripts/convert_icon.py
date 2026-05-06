"""
Generate multi-source Win32 ICO, macOS ICNS, or standalone PNG from artboard PNG files.

Each ICO/ICNS frame is sampled from the artboard whose native size is the
smallest one that is >= the target size, which keeps downscaling
minimal and avoids upscaling artefacts.

Usage:
    python scripts/convert_icon.py --ico assets/icon.ico
    python scripts/convert_icon.py --ico assets/icon.ico --png dist/linux/icon.png
    python scripts/convert_icon.py --icns assets/icon.icns

@module convert_icon
"""

from __future__ import annotations

import argparse
import io
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, BmpImagePlugin  # noqa: F401 – BMP plugin must be registered


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# Available artboard PNGs mapped to their native pixel dimensions (square).
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

# macOS ICNS target sizes (each exported at 1x and 2x).
ICNS_SIZES: list[int] = [16, 32, 64, 128, 256, 512, 1024]

# PNG chunk threshold: frames at or above this size are stored as PNG.
PNG_THRESHOLD: int = 256

# Default resolution for the standalone PNG export.
PNG_EXPORT_SIZE: int = 256


# ---------------------------------------------------------------------------
# Source selection
# ---------------------------------------------------------------------------

def _best_artboard(target: int) -> Image.Image:
    """Return the RGBA artboard best suited for *target* pixels."""
    available = [(s, p) for s, p in ARTBOARDS if p.exists()]
    if not available:
        raise FileNotFoundError("No artboard PNG files found in the repository root")
    candidates = [(s, p) for s, p in available if s >= target]
    _, path = min(candidates, key=lambda x: x[0]) if candidates else max(available, key=lambda x: x[0])
    return Image.open(path).convert("RGBA")


def _make_frame(size: int) -> Image.Image:
    """Produce a *size* x *size* RGBA frame from the best artboard."""
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
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)
    return buf.getvalue()


def _encode_bmp_chunk(img: Image.Image) -> bytes:
    w, h = img.size
    buf = io.BytesIO()
    header = struct.pack(
        "<IiiHHIIiiII",
        40, w, h * 2, 1, 32, 0, 0, 0, 0, 0, 0,
    )
    buf.write(header)
    rgba = img.tobytes("raw", "RGBA")
    row_size = w * 4
    rows = [rgba[y * row_size:(y + 1) * row_size] for y in range(h)]
    for row in reversed(rows):
        bgra_row = bytearray(row_size)
        for x in range(w):
            bgra_row[x * 4 + 0] = row[x * 4 + 2]
            bgra_row[x * 4 + 1] = row[x * 4 + 1]
            bgra_row[x * 4 + 2] = row[x * 4 + 0]
            bgra_row[x * 4 + 3] = row[x * 4 + 3]
        buf.write(bgra_row)
    mask_row_size = ((w + 31) // 32) * 4
    buf.write(b"\x00" * mask_row_size * h)
    return buf.getvalue()


def _build_ico(frames: list[Image.Image]) -> bytes:
    chunks: list[bytes] = []
    for img in frames:
        if img.width >= PNG_THRESHOLD:
            chunks.append(_encode_png_chunk(img))
        else:
            chunks.append(_encode_bmp_chunk(img))

    count = len(frames)
    header = struct.pack("<HHH", 0, 1, count)
    data_offset = 6 + count * 16
    directory = bytearray()
    for img, chunk in zip(frames, chunks):
        w = img.width if img.width < 256 else 0
        h = img.height if img.height < 256 else 0
        entry = struct.pack(
            "<BBBBHHII",
            w, h, 0, 0, 1, 32, len(chunk), data_offset,
        )
        directory += entry
        data_offset += len(chunk)

    return header + bytes(directory) + b"".join(chunks)


# ---------------------------------------------------------------------------
# ICNS encoding (macOS)
# ---------------------------------------------------------------------------

# Mapping: pixel size → (OSType for 1x, OSType for 2x or None)
_ICNS_TYPES: list[tuple[int, bytes, bytes | None]] = [
    (16,   b"icp4", b"ic11"),
    (32,   b"icp5", b"ic12"),
    (64,   b"icp6", None),
    (128,  b"ic07", b"ic13"),
    (256,  b"ic08", b"ic14"),
    (512,  b"ic09", b"ic10"),
    (1024, b"ic10", None),
]


def _icns_chunk(ostype: bytes, data: bytes) -> bytes:
    """Build a single ICNS chunk: 4-byte type + 4-byte length + data."""
    length = 8 + len(data)
    return ostype + struct.pack(">I", length) + data


def write_icns_pure(target: Path) -> None:
    """
    Build .icns purely in Python (no external tools needed).
    Works on any OS — used on Linux CI and as fallback on Mac.
    """
    target.parent.mkdir(parents=True, exist_ok=True)

    chunks: list[bytes] = []

    for size, ostype_1x, ostype_2x in _ICNS_TYPES:
        # 1x frame
        img_1x = _make_frame(size)
        png_1x = _encode_png_chunk(img_1x)
        chunks.append(_icns_chunk(ostype_1x, png_1x))

        # 2x (Retina) frame — same image at 2× pixel density
        if ostype_2x is not None:
            img_2x = _make_frame(min(size * 2, 1024))
            png_2x = _encode_png_chunk(img_2x)
            chunks.append(_icns_chunk(ostype_2x, png_2x))

    body = b"".join(chunks)
    # ICNS file header: magic + total file length
    total = 8 + len(body)
    icns_bytes = b"icns" + struct.pack(">I", total) + body
    target.write_bytes(icns_bytes)


def write_icns_iconutil(target: Path) -> None:
    """
    Build .icns using macOS iconutil (highest quality, requires macOS).
    Falls back to write_icns_pure on failure.
    """
    target.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()

        # iconutil expects files named exactly like:
        # icon_16x16.png, icon_16x16@2x.png, icon_32x32.png ...
        for size in [16, 32, 128, 256, 512]:
            img_1x = _make_frame(size)
            img_1x.save(iconset / f"icon_{size}x{size}.png", format="PNG")

            img_2x = _make_frame(min(size * 2, 1024))
            img_2x.save(iconset / f"icon_{size}x{size}@2x.png", format="PNG")

        result = subprocess.run(
            ["iconutil", "-c", "icns", str(iconset), "-o", str(target)],
            capture_output=True,
        )
        if result.returncode != 0:
            print(f"[WARN] iconutil failed: {result.stderr.decode()}, falling back to pure Python")
            write_icns_pure(target)


def write_icns(target: Path) -> None:
    """
    Write a macOS .icns file.
    Uses iconutil on macOS (best quality), pure Python elsewhere.
    """
    if sys.platform == "darwin":
        write_icns_iconutil(target)
    else:
        write_icns_pure(target)


# ---------------------------------------------------------------------------
# ICO / PNG public API (unchanged)
# ---------------------------------------------------------------------------

def write_ico(target: Path) -> None:
    """Write a multi-frame Win32 ICO file to *target*."""
    target.parent.mkdir(parents=True, exist_ok=True)
    frames = [_make_frame(s) for s in ICO_SIZES]
    ico_bytes = _build_ico(frames)
    target.write_bytes(ico_bytes)


def write_png(target: Path, size: int = PNG_EXPORT_SIZE) -> None:
    """Write a single PNG icon of *size* x *size* pixels to *target*."""
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
    parser.add_argument("--ico",  type=Path, default=None, help="Output .ico path (Windows)")
    parser.add_argument("--png",  type=Path, default=None, help="Output .png path (Linux)")
    parser.add_argument("--icns", type=Path, default=None, help="Output .icns path (macOS)")
    args = parser.parse_args()

    if args.ico is None and args.png is None and args.icns is None:
        parser.error("Specify at least one of --ico, --png, --icns")

    if args.ico is not None:
        write_ico(args.ico)
        sizes_label = ", ".join(f"{s}x{s}" for s in ICO_SIZES)
        print(f"[OK] {args.ico}  ({sizes_label})")

    if args.png is not None:
        write_png(args.png)
        print(f"[OK] {args.png}  ({PNG_EXPORT_SIZE}x{PNG_EXPORT_SIZE})")

    if args.icns is not None:
        write_icns(args.icns)
        print(f"[OK] {args.icns}")


if __name__ == "__main__":
    main()
