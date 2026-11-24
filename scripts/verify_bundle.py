"""Проверка собранного бинарника: статика внутри него совпадает с исходниками.

Запуск после PyInstaller (его вызывают build_WIN.bat и build_linux_alt.bat):

    python scripts/verify_bundle.py dist/win32/Pochtelye.exe

Сравниваются текстовые файлы из static/ (js, css, html, json): каждый должен быть в
бинарнике и совпадать с исходником (переводы строк не учитываются). Остальные файлы
static/ проверяются только на наличие.

Коды выхода: 0 — всё совпало; 1 — бинарник отличается от исходников (сборку нужно
повторить); 2 — проверить не удалось (нет PyInstaller, нечитаемый архив и т. п.).
"""

import sys
from pathlib import Path

EXIT_OK = 0
EXIT_MISMATCH = 1
EXIT_CANNOT_VERIFY = 2

ROOT = Path(__file__).resolve().parent.parent
TEXT_SUFFIXES = {'.js', '.css', '.html', '.json'}
SKIP_PARTS = {'__pycache__'}
BACKSLASH = chr(92)


def _normalize(data: bytes) -> bytes:
    return data.replace(b'\r\n', b'\n')


def _bundled_static(reader) -> dict:
    """{путь внутри static/ в виде 'js/main.js': имя записи в архиве}."""
    bundled = {}
    for name in reader.toc:
        path = name.replace(BACKSLASH, '/')
        if path.startswith('static/'):
            bundled[path[len('static/'):]] = name
    return bundled


def _source_static(root: Path) -> list:
    """Файлы static/ в проекте как пути вида 'js/main.js'."""
    static_dir = root / 'static'
    return sorted(
        path.relative_to(static_dir).as_posix()
        for path in static_dir.rglob('*')
        if path.is_file() and not SKIP_PARTS.intersection(path.parts)
    )


def verify(binary: Path, root: Path = ROOT) -> tuple:
    """Возвращает (число проверенных файлов, пропавшие, отличающиеся)."""
    from PyInstaller.archive.readers import CArchiveReader

    reader = CArchiveReader(str(binary))
    bundled = _bundled_static(reader)

    missing, different, checked = [], [], 0
    for rel in _source_static(root):
        entry = bundled.get(rel)
        if entry is None:
            missing.append(rel)
            continue
        if Path(rel).suffix.lower() not in TEXT_SUFFIXES:
            continue
        checked += 1
        data = reader.extract(entry)
        if isinstance(data, tuple):
            data = data[-1]
        if _normalize((root / 'static' / rel).read_bytes()) != _normalize(data):
            different.append(rel)
    return checked, missing, different


def main(argv: list) -> int:
    if len(argv) != 2:
        print('Использование: verify_bundle.py <путь к бинарнику>')
        return EXIT_CANNOT_VERIFY
    binary = Path(argv[1])
    if not binary.is_file():
        print(f'[verify_bundle] файл не найден: {binary}')
        return EXIT_CANNOT_VERIFY

    try:
        checked, missing, different = verify(binary)
    except Exception as exc:  # noqa: BLE001 — любой сбой проверки не должен валить сборку
        print(f'[verify_bundle] проверить не удалось: {exc}')
        return EXIT_CANNOT_VERIFY

    if missing or different:
        print(f'[verify_bundle] БИНАРНИК НЕ СОВПАДАЕТ С ИСХОДНИКАМИ ({binary.name})')
        for rel in missing:
            print(f'  нет в бинарнике: static/{rel}')
        for rel in different:
            print(f'  отличается:      static/{rel}')
        return EXIT_MISMATCH

    print(f'[verify_bundle] OK: {checked} текстовых файлов static/ совпадают с исходниками')
    return EXIT_OK


if __name__ == '__main__':
    sys.exit(main(sys.argv))
