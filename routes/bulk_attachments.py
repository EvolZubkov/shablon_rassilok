"""Bulk mail attachments: file-name resolution, upload store, size limits, planning.

Two kinds of attachment can be combined in one mailing:

* ``common``     — one or several files uploaded in the window, sent to everyone;
* ``individual`` — a file looked up per row by a name template or a table column.

The module has no Flask or Exchange dependencies: ``routes/bulk_mail.py`` wires it
to the HTTP routes and the sending loop, and tests exercise it directly.
"""
from __future__ import annotations

import atexit
import logging
import os
import re
import shutil
import tempfile
import time
import unicodedata
import uuid

_logger = logging.getLogger(__name__)

MAX_COMMON_FILES = 10
DEFAULT_MAX_MESSAGE_MB = 10.0     # Exchange transport default; the admin can override it
BASE64_FACTOR = 4 / 3             # a file grows by a third when encoded into the message
BODY_RESERVE_BYTES = 200 * 1024   # headers and the HTML body
MISSING_POLICIES = ('send', 'skip', 'stop')

# Executables and scripts: mail gateways and Outlook reject them, so there is no
# point in letting the user add one and learn about it from a server error.
BLOCKED_EXTENSIONS = frozenset({
    '.ade', '.adp', '.app', '.bat', '.chm', '.cmd', '.com', '.cpl', '.dll', '.exe',
    '.hta', '.ins', '.isp', '.jar', '.js', '.jse', '.lib', '.lnk', '.mde', '.msc',
    '.msi', '.msp', '.mst', '.pif', '.ps1', '.reg', '.scr', '.sct', '.shb', '.sys',
    '.vb', '.vbe', '.vbs', '.vxd', '.wsc', '.wsf', '.wsh',
})

STORE_DIR = os.path.join(tempfile.gettempdir(), 'pochtelie-bulk-attachments')
STORE_MAX_AGE_SECONDS = 24 * 3600
_TOKEN_RE = re.compile(r'^[0-9a-f]{32}$')
_ILLEGAL_NAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


# ── File-name resolution ──────────────────────────────────────────────────────

def normalize_filename(name: str) -> str:
    """Key for tolerant file-name comparison: NFC, case-folded, ё→е, single spaces."""
    text = unicodedata.normalize('NFC', name).casefold().replace('ё', 'е')
    return re.sub(r'\s+', ' ', text).strip()


def substitute_by_column_name(text: str, row: dict) -> str:
    """Replace remaining ``{{Column}}`` with the row value of the column with that
    name (case-, ё/е- and space-insensitive). Unknown placeholders stay as is."""
    by_name = {normalize_filename(str(col)): value for col, value in row.items()}

    def _replace(match: re.Match) -> str:
        key = normalize_filename(match.group(1))
        if key not in by_name:
            return match.group(0)
        return str(by_name[key] if by_name[key] is not None else '')

    return re.sub(r'\{\{([^{}]+)\}\}', _replace, text)


def list_files(folder: str, cache: dict | None = None) -> list[str]:
    """File names in ``folder``; with ``cache`` the folder is listed once per job."""
    if cache is not None and folder in cache:
        return cache[folder]
    try:
        names = [n for n in os.listdir(folder) if os.path.isfile(os.path.join(folder, n))]
    except OSError:
        names = []
    if cache is not None:
        cache[folder] = names
    return names


def find_file_detailed(folder: str, fname: str, cache: dict | None = None) -> tuple[str | None, str]:
    """``(path, reason)`` — reason is ``ok``, ``missing`` or ``ambiguous``.

    Exact match first; otherwise compare names ignoring case, ё/е, Unicode form
    (NFC/NFD) and repeated/trailing spaces — typical differences between a
    spreadsheet cell and the real file name.

    A cell without extension ("Условия активации") matches by file stem, but only
    when exactly one file has that stem: with several (``.docx`` and ``.pdf``) the
    choice is ambiguous and nothing is attached rather than the wrong file.
    """
    exact = os.path.join(folder, fname)
    if os.path.isfile(exact):
        return exact, 'ok'
    wanted = normalize_filename(fname)
    names = list_files(folder, cache)
    for name in names:
        if normalize_filename(name) == wanted:
            return os.path.join(folder, name), 'ok'
    stem_matches = [n for n in names if normalize_filename(os.path.splitext(n)[0]) == wanted]
    if len(stem_matches) > 1:
        _logger.warning('bulk_send: ambiguous attachment name %r in %r — candidates: %s',
                        fname, folder, ', '.join(sorted(stem_matches)))
        return None, 'ambiguous'
    if stem_matches:
        return os.path.join(folder, stem_matches[0]), 'ok'
    return None, 'missing'


def find_file_tolerant(folder: str, fname: str, cache: dict | None = None) -> str | None:
    return find_file_detailed(folder, fname, cache)[0]


def resolve_attachment_detail(folder: str, filename_tpl: str, mapping: dict, row: dict,
                              column: str = '', dir_cache: dict | None = None) -> dict:
    """Locate the attachment of one row: ``{'path', 'name', 'reason'}``.

    The file name is taken from ``column`` of the row when given (mode "Колонка"),
    otherwise from ``filename_tpl`` with ``{{placeholders}}`` substituted.
    ``reason`` is ``ok``, ``not_configured``, ``no_name``, ``missing`` or ``ambiguous``.
    """
    if not folder or not (column or filename_tpl):
        _logger.warning('bulk_send: attach folder/name empty: folder=%r filename_tpl=%r column=%r',
                        folder, filename_tpl, column)
        return {'path': None, 'name': '', 'reason': 'not_configured'}
    if column:
        fname = str(row.get(column) or '').strip()
    else:
        # Substitute placeholders in filename template (plain text, no HTML escape)
        fname = filename_tpl
        for ph, col in mapping.items():
            fname = fname.replace(ph, str(row.get(col) or ''))   # col '' — не сопоставлено, пусто
        # A placeholder used only in the file-name template may be absent from
        # ``mapping`` (old clients): resolve it directly by column name.
        fname = substitute_by_column_name(fname, row)
    # Sanitize: remove characters that are illegal in filenames
    fname = _ILLEGAL_NAME_CHARS.sub('_', fname)
    if not fname:
        _logger.warning('bulk_send: attachment name is empty (column=%r)', column)
        return {'path': None, 'name': '', 'reason': 'no_name'}
    found, reason = find_file_detailed(folder, fname, dir_cache)
    if not found:
        _logger.warning(
            'bulk_send: attachment NOT found — folder=%r filename_tpl=%r column=%r fname=%r',
            folder, filename_tpl, column, fname,
        )
    return {'path': found, 'name': fname, 'reason': reason}


def resolve_attachment(folder: str, filename_tpl: str, mapping: dict, row: dict,
                       column: str = '', dir_cache: dict | None = None) -> str | None:
    """Full path to an attachment file, or None if not found/not configured."""
    return resolve_attachment_detail(folder, filename_tpl, mapping, row, column, dir_cache)['path']


# ── Size limits ───────────────────────────────────────────────────────────────

def message_limit_bytes(configured_mb: float | None = None, server_bytes: int | None = None) -> int:
    """Largest message the server accepts: the smaller of the configured limit and
    the size the SMTP server announced in EHLO (when it did)."""
    mb = configured_mb if configured_mb and configured_mb > 0 else DEFAULT_MAX_MESSAGE_MB
    limit = int(mb * 1024 * 1024)
    if server_bytes and server_bytes > 0:
        limit = min(limit, int(server_bytes))
    return limit


def files_budget(limit_bytes: int) -> int:
    """How many bytes of raw files fit into a message of ``limit_bytes``
    (base64 encoding and the body take their share)."""
    return max(0, int((limit_bytes - BODY_RESERVE_BYTES) / BASE64_FACTOR))


def blocked_extension(name: str) -> str | None:
    ext = os.path.splitext(name or '')[1].lower()
    return ext if ext in BLOCKED_EXTENSIONS else None


# ── Upload store for common files ─────────────────────────────────────────────

def safe_file_name(name: str) -> str:
    base = os.path.basename(str(name or '').replace('\\', '/'))
    cleaned = _ILLEGAL_NAME_CHARS.sub('_', base).strip(' .')
    return cleaned or 'file'


def store_path(token: str) -> str | None:
    """Path of an uploaded file by its token; None for unknown or malformed tokens."""
    if not isinstance(token, str) or not _TOKEN_RE.match(token):
        return None
    folder = os.path.join(STORE_DIR, token)
    try:
        names = os.listdir(folder)
    except OSError:
        return None
    return os.path.join(folder, names[0]) if names else None


class UploadError(ValueError):
    """The file cannot be added (blocked type, too large, too many files)."""


def save_upload(name: str, data: bytes, existing_files: int = 0, existing_bytes: int = 0,
                budget_bytes: int | None = None) -> dict:
    """Store an uploaded common attachment; returns ``{'token', 'name', 'size'}``."""
    clean = safe_file_name(name)
    ext = blocked_extension(clean)
    if ext:
        raise UploadError(f'Файлы {ext} почтовые серверы не пропускают, вложить его нельзя')
    if existing_files >= MAX_COMMON_FILES:
        raise UploadError(f'Не больше {MAX_COMMON_FILES} общих файлов')
    if not data:
        raise UploadError('Файл пустой')
    if budget_bytes is not None and existing_bytes + len(data) > budget_bytes:
        raise UploadError(
            'Не помещается в письмо: ' + _mb(existing_bytes + len(data)) +
            ' из допустимых ' + _mb(budget_bytes))
    token = uuid.uuid4().hex
    folder = os.path.join(STORE_DIR, token)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, clean), 'wb') as fh:
        fh.write(data)
    return {'token': token, 'name': clean, 'size': len(data)}


def delete_upload(token: str) -> bool:
    if not isinstance(token, str) or not _TOKEN_RE.match(token):
        return False
    shutil.rmtree(os.path.join(STORE_DIR, token), ignore_errors=True)
    return True


def purge_store(max_age_seconds: float | None = STORE_MAX_AGE_SECONDS) -> int:
    """Remove uploads older than ``max_age_seconds`` (all of them for None)."""
    removed = 0
    try:
        entries = os.listdir(STORE_DIR)
    except OSError:
        return 0
    now = time.time()
    for entry in entries:
        path = os.path.join(STORE_DIR, entry)
        try:
            if max_age_seconds is None or now - os.path.getmtime(path) > max_age_seconds:
                shutil.rmtree(path, ignore_errors=True)
                removed += 1
        except OSError:
            continue
    return removed


def _mb(size: int) -> str:
    return f'{size / (1024 * 1024):.1f} МБ'.replace('.', ',')


# Uploads are scratch data: forget old ones at start-up and everything at exit.
purge_store()
atexit.register(purge_store, None)


# ── Specs and per-row planning ────────────────────────────────────────────────

def normalize_specs(data: dict) -> list[dict]:
    """Attachment specs of a request.

    Reads the ``attachments`` list; requests of older clients carry the single
    ``attach_*`` set, which becomes one individual spec.
    """
    raw = data.get('attachments')
    if raw is None:
        if not data.get('attach_enabled'):
            return []
        raw = [{
            'kind': 'individual',
            'folder': data.get('attach_folder', ''),
            'mode': data.get('attach_mode', 'template'),
            'template': data.get('attach_template', ''),
            'column': data.get('attach_column', ''),
            'missing': data.get('attach_missing', 'send'),
        }]
    specs = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        if item.get('kind') == 'common':
            tokens = [t for t in item.get('files') or [] if isinstance(t, str)]
            specs.append({'kind': 'common', 'files': tokens})
        elif item.get('kind') == 'individual':
            mode = 'column' if item.get('mode') == 'column' else 'template'
            missing = item.get('missing') if item.get('missing') in MISSING_POLICIES else 'send'
            specs.append({
                'kind': 'individual',
                'folder': str(item.get('folder') or '').strip(),
                'mode': mode,
                'template': str(item.get('template') or '').strip(),
                'column': str(item.get('column') or '').strip() if mode == 'column' else '',
                'missing': missing,
            })
    return specs


def spec_label(spec: dict, index: int) -> str:
    if spec['kind'] == 'common':
        return f'Вложение {index + 1}: общие файлы'
    what = f'колонка «{spec["column"]}»' if spec['mode'] == 'column' else spec['template']
    return f'Вложение {index + 1}: индивидуальное ({what})'


def plan_row(specs: list[dict], mapping: dict, row: dict, dir_cache: dict | None = None) -> dict:
    """What to attach to one row.

    Returns ``{'items': [{'path', 'name', 'spec'}], 'problems': [{'spec', 'reason',
    'expected'}]}``. A problem is a file that was meant to be attached but cannot be.
    """
    items: list[dict] = []
    problems: list[dict] = []
    for index, spec in enumerate(specs):
        if spec['kind'] == 'common':
            for token in spec['files']:
                path = store_path(token)
                if path:
                    items.append({'path': path, 'name': os.path.basename(path), 'spec': index})
                else:
                    problems.append({'spec': index, 'reason': 'expired', 'expected': ''})
            continue
        detail = resolve_attachment_detail(
            spec['folder'], spec['template'], mapping, row, spec['column'], dir_cache)
        if detail['path']:
            blocked = blocked_extension(detail['path'])
            if blocked:
                problems.append({'spec': index, 'reason': 'blocked', 'expected': detail['name']})
            else:
                items.append({'path': detail['path'], 'name': os.path.basename(detail['path']),
                              'spec': index})
        else:
            problems.append({'spec': index, 'reason': detail['reason'], 'expected': detail['name']})
    return {'items': items, 'problems': problems}


def items_size(items: list[dict]) -> int:
    total = 0
    for item in items:
        try:
            total += os.path.getsize(item['path'])
        except OSError:
            continue
    return total


def estimated_message_bytes(file_bytes: int) -> int:
    return int(file_bytes * BASE64_FACTOR) + BODY_RESERVE_BYTES


REASON_TEXT = {
    'missing': 'файл не найден',
    'ambiguous': 'найдено несколько файлов с таким именем',
    'no_name': 'в таблице не указано имя файла',
    'not_configured': 'не указана папка или имя файла',
    'blocked': 'такой тип файла почтовые серверы не пропускают',
    'expired': 'загруженный файл больше недоступен, добавьте его заново',
}


def preflight(rows: list[dict], specs: list[dict], mapping: dict, email_column: str,
              skip_no_email: bool, limit_bytes: int, sample: int = 5000) -> dict:
    """Check every row to be sent against the attachment settings, without sending.

    Returns per-spec counts and up to ``sample`` problems (the window lists the first
    few and uses the rest to flag the row being previewed), plus how many rows would
    exceed the size limit.
    """
    dir_cache: dict = {}
    report = [{'index': i, 'kind': s['kind'], 'label': spec_label(s, i), 'found': 0,
               'missing': 0, 'ambiguous': 0, 'blocked': 0, 'other': 0, 'problems': [],
               'policy': s.get('missing', 'send'),
               'files': len(s['files']) if s['kind'] == 'common' else 0}
              for i, s in enumerate(specs)]
    oversize = {'count': 0, 'max_bytes': 0, 'rows': []}
    checked = 0

    for number, row in enumerate(rows, start=1):
        email = str(row.get(email_column) or '').strip()
        if skip_no_email and not email:
            continue
        checked += 1
        plan = plan_row(specs, mapping, row, dir_cache)
        for item in plan['items']:
            report[item['spec']]['found'] += 1
        for problem in plan['problems']:
            entry = report[problem['spec']]
            key = problem['reason'] if problem['reason'] in ('missing', 'ambiguous', 'blocked') else 'other'
            entry[key] += 1
            if len(entry['problems']) < sample:
                entry['problems'].append({
                    'row': number, 'email': email, 'expected': problem['expected'],
                    'reason': problem['reason'], 'text': REASON_TEXT.get(problem['reason'], ''),
                })
        size = estimated_message_bytes(items_size(plan['items']))
        oversize['max_bytes'] = max(oversize['max_bytes'], size)
        if size > limit_bytes:
            oversize['count'] += 1
            if len(oversize['rows']) < sample:
                oversize['rows'].append({'row': number, 'email': email, 'bytes': size})

    common_bytes = sum(
        os.path.getsize(p) for s in specs if s['kind'] == 'common'
        for p in (store_path(t) for t in s['files']) if p)
    return {
        'limit_bytes': limit_bytes,
        'files_budget': files_budget(limit_bytes),
        'rows_checked': checked,
        'common_bytes': common_bytes,
        'oversize': oversize,
        'attachments': report,
    }
