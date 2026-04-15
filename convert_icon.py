"""
Generate high-quality application icons from the best available PNG source.

Usage examples:
    python convert_icon.py --ico icon.ico
    python convert_icon.py --ico /app/icon.ico --png /app/dist/linux/icon.png
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE_CANDIDATES = [
    ROOT / "Монтажная область 1512px.png",
    ROOT / "Монтажная область 1256px.png",
    ROOT / "Монтажная область 1128px.png",
    ROOT / "Монтажная область 1.png",
    ROOT / "Монтажная область 164px.png",
    ROOT / "Монтажная область 132px.png",
]
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def pick_source() -> Path:
    for candidate in SOURCE_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("No icon PNG source found")


def load_source_image(source: Path) -> Image.Image:
    return Image.open(source).convert("RGBA")


def write_ico(image: Image.Image, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="ICO", sizes=ICO_SIZES)


def write_png(image: Image.Image, target: Path, size: int = 256) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    rendered = image.copy()
    rendered.thumbnail((size, size), Image.Resampling.LANCZOS)
    rendered.save(target, format="PNG")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ico", type=Path, default=None, help="Path to output .ico")
    parser.add_argument("--png", type=Path, default=None, help="Path to output .png")
    args = parser.parse_args()

    if args.ico is None and args.png is None:
        parser.error("Specify at least one of --ico or --png")

    source = pick_source()
    image = load_source_image(source)

    if args.ico is not None:
        write_ico(image, args.ico)
        print(f"icon.ico written from {source.name} -> {args.ico}")

    if args.png is not None:
        write_png(image, args.png)
        print(f"icon.png written from {source.name} -> {args.png}")


if __name__ == "__main__":
    main()
