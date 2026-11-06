"""
Flask blueprint: bulk mail — file parsing and sending.

Routes:
    POST /api/bulk/parse              — parse Excel/ODS file
    GET  /api/bulk/attach/limits      — message size limit and blocked file types
    POST /api/bulk/attach/upload      — store common attachments (several files)
    POST /api/bulk/attach/delete      — remove a stored common attachment
    POST /api/bulk/preflight          — check attachments of all rows, send nothing
    POST /api/bulk/send-test          — send test email to self
    POST /api/bulk/send/start         — start bulk send job, returns job_id
    GET  /api/bulk/send/stream/<id>   — SSE stream: progress events
    POST /api/bulk/send/cancel/<id>   — cancel running job
"""
from __future__ import annotations

import base64
import datetime
import html as _html
import io
import json
import logging
import mimetypes
import os
import queue
import re
import smtplib
import threading
import unicodedata
import uuid

_logger = logging.getLogger(__name__)

from flask import Blueprint, Response, jsonify, request, stream_with_context

import app as _m  # live access to app.py globals (same pattern as exchange.py)
from routes import bulk_attachments as _att
from routes.bulk_attachments import (  # noqa: F401  (имена сохранены для тестов и совместимости)
    find_file_tolerant as _find_file_tolerant,
    list_files as _list_files,
    normalize_filename as _normalize_filename,
    resolve_attachment as _resolve_attachment,
    substitute_by_column_name as _substitute_by_column_name,
)

bp = Blueprint('bulk_mail', __name__)

# ── In-memory job store ───────────────────────────────────────────────────────
_jobs: dict = {}
_jobs_lock  = threading.Lock()


def _job_id() -> str:
    return uuid.uuid4().hex[:16]


# ── Placeholder substitution ─────────────────────────────────────────────────

_URL_RE = re.compile(r'^https?://', re.I)
_URL_IN_TEXT_RE = re.compile(r'''https?://[^\s<>"']+''', re.I)
_URL_TRAILING = '.,;:!?)]}»'
_LINK_COLOR = '#7700ff'
_TAG_RE = re.compile(r'<[^>]*>')
_ANCHOR_OPEN_RE = re.compile(r'<a[\s>]', re.I)
_ANCHOR_CLOSE_RE = re.compile(r'</a\s*>', re.I)


def _linkify(raw: str) -> str:
    """HTML-escape ``raw`` and wrap every http(s) URL in a styled <a>.

    The brand colour is set inline so that clients (Evolution, Outlook) do not
    fall back to the default blue of their own auto-linking.
    """
    out = []
    pos = 0
    for m in _URL_IN_TEXT_RE.finditer(raw):
        url = m.group(0)
        stripped = url.rstrip(_URL_TRAILING)
        end = m.start() + len(stripped)
        out.append(_html.escape(raw[pos:m.start()]))
        href = _html.escape(stripped, quote=True)
        out.append(
            f'<a href="{href}" '
            f'style="color:{_LINK_COLOR}; text-decoration:underline;">'
            f'{_html.escape(stripped)}</a>'
        )
        pos = end
    out.append(_html.escape(raw[pos:]))
    return ''.join(out)


def _substitute(template: str, mapping: dict, row: dict) -> str:
    """Replace {{ColName}} with row values (HTML-escaped).

    Handles both plain ``{{X}}`` text and spans inserted by the {{}} toolbar:
    ``<span class="bm-inline-ph" ...>{{X}}</span>``

    The template is processed tag by tag, in a single pass:
    * inside a tag (href="{{X}}", src="...{{X}}", style) the value is inserted
      as an escaped attribute value, never as markup;
    * in text outside <a> a URL in the value becomes a styled <a>;
    * in text inside an existing <a> the value stays plain (no nested anchors,
      which Evolution and Outlook render as broken links).
    Substituted values are not scanned again, so a value that itself looks
    like ``{{Other}}`` is left as is.
    """
    if not mapping:
        return template

    result = template
    for ph in mapping:
        result = re.sub(
            r'<span[^>]+class="[^"]*bm-inline-ph[^"]*"[^>]*>(' + re.escape(ph) + r')</span>',
            lambda m: m.group(1),
            result,
        )

    ph_re = re.compile(
        '|'.join(re.escape(ph) for ph in sorted(mapping, key=len, reverse=True))
    )

    def raw_value(ph: str) -> str:
        return str(row.get(mapping[ph]) or '')

    out = []
    pos = 0
    anchor_depth = 0
    for tag in _TAG_RE.finditer(result):
        text = result[pos:tag.start()]
        if anchor_depth:
            out.append(ph_re.sub(lambda m: _html.escape(raw_value(m.group(0))), text))
        else:
            out.append(ph_re.sub(lambda m: _linkify(raw_value(m.group(0))), text))

        markup = tag.group(0)
        out.append(ph_re.sub(
            lambda m: _html.escape(raw_value(m.group(0)), quote=True), markup))
        if _ANCHOR_CLOSE_RE.match(markup):
            anchor_depth = max(0, anchor_depth - 1)
        elif _ANCHOR_OPEN_RE.match(markup):
            anchor_depth += 1
        pos = tag.end()

    tail = result[pos:]
    func = (lambda m: _html.escape(raw_value(m.group(0)))) if anchor_depth         else (lambda m: _linkify(raw_value(m.group(0))))
    out.append(ph_re.sub(func, tail))
    return ''.join(out)


def _effective_mapping(data: dict) -> dict:
    """Mapping from the request plus every placeholder the client found but the
    user left unmapped, pointed at no column: its value is empty.

    Without this an unmapped ``{{X}}`` would stay in the subject and body
    literally, which looks like a broken letter to the recipient.
    """
    mapping = dict(data.get('mapping') or {})
    for ph in data.get('placeholders') or []:
        if isinstance(ph, str) and ph not in mapping:
            mapping[ph] = ''
    return mapping


def _connect(from_email: str = '', channel: str = 'exchange') -> tuple:
    """Load credentials and return (account_or_smtp, creds) or raise.

    Returns:
        channel='exchange' → (exchangelib.Account, creds)
        channel='smtp'     → (smtplib.SMTP, creds)
    """
    path = _m.get_credentials_path()
    if not _m.credentials_exist(path):
        raise ValueError('Учётные данные не настроены')
    creds = _m.load_credentials(path)
    if not creds:
        raise ValueError('Не удалось загрузить учётные данные')

    if channel == 'smtp':
        host     = creds.get('smtp_host', '')
        port     = int(creds.get('smtp_port') or 587)
        username = creds.get('smtp_username', '')
        password = creds.get('smtp_password', '')
        if not host or not username:
            raise ValueError('SMTP не настроен. Заполните настройки SMTP.')
        smtp = _m.connect_smtp(host, port, username, password)
        return smtp, creds

    # Exchange
    effective_from = from_email.strip() or creds.get('from_email', '')
    account = _m.connect_exchange(
        creds['server'], creds['username'], creds['password'],
        effective_from,
        auth_type=creds.get('auth_type', 'ntlm'),
    )
    return account, creds


# ── Attachments: upload store, limits, pre-send check ─────────────────────────

def _limits_payload() -> dict:
    limit = _att.message_limit_bytes(_configured_limit_mb())
    return {
        'limit_bytes':  limit,
        'budget_bytes': _att.files_budget(limit),
        'max_files':    _att.MAX_COMMON_FILES,
        'blocked':      sorted(_att.BLOCKED_EXTENSIONS),
    }


@bp.route('/api/bulk/attach/limits', methods=['GET'])
def api_bulk_attach_limits():
    """Size limit and blocked types, so the window can refuse a file in advance."""
    return jsonify(_limits_payload())


@bp.route('/api/bulk/attach/upload', methods=['POST'])
def api_bulk_attach_upload():
    """Store common attachments (one or several files) until the mailing is sent.

    Form fields: ``files`` (multiple), ``existing_files`` and ``existing_bytes`` —
    what the window already holds, to check the total against the limit.
    Files that cannot be added come back in ``rejected`` with the reason.
    """
    files = request.files.getlist('files')
    if not files:
        return jsonify({'error': 'Файлы не переданы'}), 400
    try:
        existing_files = max(0, int(request.form.get('existing_files') or 0))
        existing_bytes = max(0, int(request.form.get('existing_bytes') or 0))
    except ValueError:
        return jsonify({'error': 'Некорректные параметры'}), 400

    limits = _limits_payload()
    saved, rejected = [], []
    for upload in files:
        name = upload.filename or 'file'
        try:
            item = _att.save_upload(name, upload.read(), existing_files, existing_bytes,
                                    limits['budget_bytes'])
        except _att.UploadError as e:
            rejected.append({'name': name, 'error': str(e)})
            continue
        saved.append(item)
        existing_files += 1
        existing_bytes += item['size']
    return jsonify({'files': saved, 'rejected': rejected, **limits})


@bp.route('/api/bulk/attach/delete', methods=['POST'])
def api_bulk_attach_delete():
    data = request.get_json(silent=True) or {}
    return jsonify({'ok': _att.delete_upload(data.get('token', ''))})


@bp.route('/api/bulk/preflight', methods=['POST'])
def api_bulk_preflight():
    """Check attachments of every row before sending: what is found, what is missing,
    what exceeds the size limit. Nothing is sent."""
    data = request.get_json(silent=True) or {}
    rows = data.get('rows')
    if not isinstance(rows, list):
        return jsonify({'error': 'Нет строк для проверки'}), 400
    specs = _att.normalize_specs(data)
    report = _att.preflight(
        rows, specs, _effective_mapping(data), str(data.get('email_column') or 'Email'),
        data.get('skip_no_email', True) is not False,
        _att.message_limit_bytes(_configured_limit_mb()),
    )
    return jsonify(report)


# ── Parse ─────────────────────────────────────────────────────────────────────

@bp.route('/api/bulk/parse', methods=['POST'])
def api_bulk_parse():
    """Parse an uploaded .xlsx / .xls / .ods file.

    Form fields:
        file        — multipart file upload
        sheet       — sheet name to read (optional, defaults to first sheet)
        header_row  — 1-based row number that contains column headers (default 1)

    Returns JSON:
        {
            "sheets":  ["Sheet1", "Sheet2", ...],
            "headers": ["ФИО", "Email", ...],
            "rows":    [{"ФИО": "...", "Email": "..."}, ...],
            "total":   127
        }
    """
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error': 'Файл не передан'}), 400

    sheet_name = request.form.get('sheet') or None
    try:
        header_row = max(1, int(request.form.get('header_row', 1)))
    except (ValueError, TypeError):
        header_row = 1

    fname = file.filename.lower()
    try:
        file_bytes = file.read()
        if fname.endswith(('.xlsx', '.xlsm')):
            result = _parse_xlsx(file_bytes, sheet_name, header_row)
        elif fname.endswith('.xls'):
            result = _parse_xls(file_bytes, sheet_name, header_row)
        elif fname.endswith('.ods'):
            result = _parse_ods(file_bytes, sheet_name, header_row)
        elif fname.endswith('.csv'):
            result = _parse_csv(file_bytes, header_row)
        else:
            return jsonify({'error': (
                f'Неподдерживаемый формат: «{file.filename}». '
                'Разрешены: .xlsx, .xls, .ods, .csv'
            )}), 400
    except ImportError as e:
        return jsonify({'error': str(e)}), 501
    except Exception as e:
        return jsonify({'error': f'Ошибка чтения файла: {e}'}), 422

    return jsonify(result)


# ── Parsers ───────────────────────────────────────────────────────────────────

def _parse_xlsx(file_bytes: bytes, sheet_name: str | None, header_row: int) -> dict:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    sheets = wb.sheetnames
    ws = wb[sheet_name] if (sheet_name and sheet_name in wb) else wb.active
    rows_raw = [
        ['' if cell is None else str(cell) for cell in row]
        for row in ws.iter_rows(values_only=True)
    ]
    wb.close()
    return _rows_to_result(rows_raw, sheets, header_row)


def _parse_xls(file_bytes: bytes, sheet_name: str | None, header_row: int) -> dict:
    try:
        import xlrd
    except ImportError:
        raise ImportError('Для .xls-файлов установите: pip install "xlrd<2.0"')
    wb = xlrd.open_workbook(file_contents=file_bytes)
    sheets = wb.sheet_names()
    ws = wb.sheet_by_name(sheet_name) if (sheet_name and sheet_name in sheets) else wb.sheet_by_index(0)
    rows_raw = [
        ['' if v is None else str(v) for v in ws.row_values(i)]
        for i in range(ws.nrows)
    ]
    return _rows_to_result(rows_raw, sheets, header_row)


def _parse_ods(file_bytes: bytes, sheet_name: str | None, header_row: int) -> dict:
    try:
        from odf.opendocument import load as ods_load
        from odf.table import Table, TableRow, TableCell
        from odf.text import P
    except ImportError:
        raise ImportError('Для .ods-файлов установите: pip install odfpy')

    doc = ods_load(io.BytesIO(file_bytes))
    tables = doc.spreadsheet.getElementsByType(Table)
    sheets = [t.getAttribute('name') for t in tables]

    target = next(
        (t for t in tables if t.getAttribute('name') == sheet_name),
        tables[0] if tables else None,
    )
    if target is None:
        raise ValueError('Лист не найден')

    rows_raw: list[list[str]] = []
    for tr in target.getElementsByType(TableRow):
        row: list[str] = []
        for tc in tr.getElementsByType(TableCell):
            repeat = int(tc.getAttribute('numbercolumnsrepeated') or 1)
            ps = tc.getElementsByType(P)
            val = ''.join(str(n) for n in ps) if ps else ''
            row.extend([val] * repeat)
        # strip trailing empty cells added by repeat
        while row and not row[-1].strip():
            row.pop()
        rows_raw.append(row)

    return _rows_to_result(rows_raw, sheets, header_row)


def _parse_csv(file_bytes: bytes, header_row: int) -> dict:
    import csv, io as _io
    # Try common encodings (BOM-aware utf-8-sig first, then cp1251 for Windows files)
    for enc in ('utf-8-sig', 'utf-8', 'cp1251', 'latin-1'):
        try:
            text = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = file_bytes.decode('utf-8', errors='replace')

    # Auto-detect delimiter from the first 8 KB
    sample = text[:8192]
    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(sample, delimiters=',;\t|')
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ','  # fallback

    reader = csv.reader(_io.StringIO(text), delimiter=delimiter)
    rows_raw = [row for row in reader]
    return _rows_to_result(rows_raw, [], header_row)


# ── Shared conversion ─────────────────────────────────────────────────────────

def _rows_to_result(rows_raw: list[list[str]], sheets: list[str], header_row: int) -> dict:
    """Convert a list-of-lists to the standard API response dict."""
    if not rows_raw:
        return {'sheets': sheets, 'headers': [], 'rows': [], 'total': 0}

    h_idx = min(header_row - 1, len(rows_raw) - 1)
    header_cells = rows_raw[h_idx]

    # Drop trailing empty columns
    while header_cells and not str(header_cells[-1]).strip():
        header_cells = header_cells[:-1]

    headers = [str(c).strip() for c in header_cells]
    col_count = len(headers)
    if col_count == 0:
        return {'sheets': sheets, 'headers': [], 'rows': [], 'total': 0}

    data_rows: list[dict] = []
    for raw in rows_raw[h_idx + 1:]:
        padded = (list(raw) + [''] * col_count)[:col_count]
        row_dict = {headers[i]: str(padded[i]).strip() for i in range(col_count)}
        # Skip completely blank rows
        if any(v for v in row_dict.values()):
            data_rows.append(row_dict)

    return {
        'sheets': sheets,
        'headers': headers,
        'rows': data_rows,
        'total': len(data_rows),
    }


# ── Send test ─────────────────────────────────────────────────────────────────

@bp.route('/api/bulk/send-test', methods=['POST'])
def api_bulk_send_test():
    """Send one test email to the logged-in user substituting the given row."""
    data = request.get_json(silent=True) or {}
    template_html = data.get('template_html', '')
    row           = data.get('row', {})
    mapping       = _effective_mapping(data)
    subject_tpl   = data.get('subject', 'Тестовое письмо')

    try:
        from_email   = data.get('from_email', '').strip()
        channel      = str(data.get('channel')    or 'exchange').lower()
        importance   = str(data.get('importance') or 'normal').lower()
        read_receipt = bool(data.get('read_receipt'))
        conn, creds = _connect(from_email, channel)
        subject = '[Тест] ' + _substitute(subject_tpl, mapping, row)
        body    = _m.prepare_html_for_email(_substitute(template_html, mapping, row))

        meta = {}
        if channel == 'smtp':
            smtp_from = from_email or creds.get('smtp_from_email', '')
            to        = smtp_from
            sent = _m.smtp_send_email(conn, smtp_from, subject, body, [smtp_from],
                                      importance=importance, read_receipt=read_receipt)
            meta = _sent_meta(sent)
            try: conn.quit()
            except Exception: pass
        else:
            to = from_email or creds.get('from_email', '')
            _m.exchange_send_email(conn, subject, body, _m.parse_recipients([to]),
                                   importance=importance, read_receipt=read_receipt)

        return jsonify({'success': True, 'to': to, **meta})
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 401
    except ConnectionError as e:
        return jsonify({'success': False, 'error': str(e)}), 503
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Bulk send ─────────────────────────────────────────────────────────────────

@bp.route('/api/bulk/send/start', methods=['POST'])
def api_bulk_send_start():
    """Queue a bulk-send job. Returns ``{job_id}`` immediately."""
    data   = request.get_json(silent=True) or {}
    jid    = _job_id()
    cancel = threading.Event()
    q: queue.Queue = queue.Queue()

    with _jobs_lock:
        _jobs[jid] = {'queue': q, 'cancel': cancel}

    threading.Thread(
        target=_run_bulk_send_guarded,
        args=(jid, data, q, cancel),
        daemon=True,
    ).start()

    return jsonify({'job_id': jid})


@bp.route('/api/bulk/send/stream/<job_id>', methods=['GET'])
def api_bulk_send_stream(job_id):
    """SSE stream for a running bulk-send job."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Задание не найдено'}), 404

    def generate():
        q = job['queue']
        while True:
            try:
                event = q.get(timeout=30)
                yield f'data: {json.dumps(event, ensure_ascii=False)}\n\n'
                if event.get('type') in ('done', 'cancelled', 'error'):
                    with _jobs_lock:
                        _jobs.pop(job_id, None)
                    break
            except queue.Empty:
                yield 'data: {"type":"heartbeat"}\n\n'

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


@bp.route('/api/bulk/send/cancel/<job_id>', methods=['POST'])
def api_bulk_send_cancel(job_id):
    """Signal a running job to stop."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job:
        job['cancel'].set()
    return jsonify({'ok': True})


# ── Background worker ─────────────────────────────────────────────────────────

def _sent_meta(sent) -> dict:
    """``message_id`` и ``server_reply`` из результата ``smtp_send_email``.

    Берём только строки: результат может быть и обычными байтами (старый
    формат) или заглушкой в тестах.
    """
    message_id = getattr(sent, 'message_id', '')
    server_reply = getattr(sent, 'server_reply', '')
    return {
        'message_id':   message_id   if isinstance(message_id, str)   else '',
        'server_reply': server_reply if isinstance(server_reply, str) else '',
    }


def _now_hms() -> str:
    return datetime.datetime.now().strftime('%H:%M:%S')


def _smtp_alive(conn) -> bool:
    """Жива ли SMTP-сессия (NOOP); сервер мог закрыть её между письмами."""
    try:
        code = conn.noop()[0]
    except Exception:
        return False
    return code == 250 if isinstance(code, int) else True


def _is_retryable_smtp_error(exc: Exception) -> bool:
    """Потеря соединения или временный отказ сервера (4xx) — повтор имеет смысл."""
    if isinstance(exc, ConnectionError):
        return True
    cause = exc.__cause__
    if isinstance(cause, smtplib.SMTPServerDisconnected):
        return True
    return (isinstance(cause, smtplib.SMTPResponseException)
            and 400 <= cause.smtp_code < 500)


def _smtp_reconnect(old_conn, from_email: str, q: queue.Queue):
    """Закрывает старую сессию и открывает новую; ошибка уходит в строку рассылки."""
    try:
        old_conn.close()
    except Exception:
        pass
    q.put({'type': 'status', 'message': 'SMTP-сессия закрыта сервером, переподключаюсь…'})
    new_conn, _creds = _connect(from_email, 'smtp')
    return new_conn


def _configured_limit_mb() -> float | None:
    """``max_message_mb`` from config.ini: the largest message the mail server accepts."""
    try:
        return float(_m._read_app_config()['app'].get('max_message_mb') or 0) or None
    except Exception:
        return None


def _smtp_size_limit(conn) -> int | None:
    """Message size the SMTP server announced in its EHLO reply (SIZE), if any."""
    try:
        return int(getattr(conn, 'esmtp_features', {}).get('size') or 0) or None
    except (TypeError, ValueError):
        return None


def _attachment_action(specs: list, problems: list) -> tuple[str, str]:
    """What to do with a row whose attachments are not all in place.

    The strictest policy among the problem attachments wins: stop, then skip, then
    send without the file. Returns ``(action, text)``; ``action`` is ``ok`` when
    nothing is wrong.
    """
    if not problems:
        return 'ok', ''
    rank = {'send': 0, 'skip': 1, 'stop': 2}
    policy = max((specs[p['spec']].get('missing', 'send') for p in problems), key=rank.get)
    parts = []
    for p in problems:
        reason = _att.REASON_TEXT.get(p['reason'], p['reason'])
        parts.append(f'вложение «{p["expected"]}»: {reason}' if p['expected'] else f'вложение: {reason}')
    return ('ok' if policy == 'send' else policy), '; '.join(parts) if policy != 'send' else         'без вложения — ' + '; '.join(parts)


def _read_attachments(items: list) -> list:
    """Attachment dicts for the senders (base64 content, as exchange_send_email expects)."""
    result = []
    for item in items:
        try:
            with open(item['path'], 'rb') as fh:
                raw = fh.read()
        except OSError as e:
            raise ValueError(f'Не удалось прочитать вложение «{item["name"]}»: {e}') from e
        mime_type, _ = mimetypes.guess_type(item['path'])
        result.append({
            'name':      item['name'],
            'content':   base64.b64encode(raw).decode('utf-8'),
            'mime_type': mime_type or 'application/octet-stream',
        })
    return result


def _run_bulk_send_guarded(job_id: str, data: dict, q: queue.Queue, cancel: threading.Event):
    """Запускает рассылку так, чтобы поток не умирал молча.

    Без этого любое необработанное исключение в подготовке (до первой строки)
    оставляет экран на 0% навсегда: поток завершён, события не придут.
    """
    try:
        _run_bulk_send(job_id, data, q, cancel)
    except Exception as e:
        _logger.exception('bulk_send: job %s crashed', job_id)
        q.put({'type': 'error', 'message': f'Внутренняя ошибка рассылки: {e}'})


def _run_bulk_send(job_id: str, data: dict, q: queue.Queue, cancel: threading.Event):
    rows          = data.get('rows', [])
    mapping       = _effective_mapping(data)
    template_html = data.get('template_html', '')
    subject_tpl   = data.get('subject', '')
    email_col     = data.get('email_column', 'Email')
    cc_raw        = data.get('cc',  '')
    bcc_raw       = data.get('bcc', '')
    skip_no_email = data.get('skip_no_email', True)
    is_draft      = data.get('draft_mode', False)
    stop_on_error = data.get('stop_on_error', False)
    delay         = float(data.get('delay', 0))
    channel        = str(data.get('channel')     or 'exchange').lower()
    from_email_req = str(data.get('from_email')  or '').strip()
    importance     = str(data.get('importance')  or 'normal').lower()
    read_receipt   = bool(data.get('read_receipt'))

    timezone = float(data.get('timezone') if data.get('timezone') is not None else 3.0)

    # Отложенная отправка. Любая ошибка настроек прерывает рассылку: тихое
    # игнорирование отправило бы все письма сразу, а это не отменить.
    send_at = None
    send_at_raw = data.get('send_at', '')
    if send_at_raw:
        schedule_error = None
        try:
            send_at = _m.parse_datetime(send_at_raw)
        except (ValueError, TypeError) as e:
            _logger.warning('bulk_send: invalid send_at %r: %s', send_at_raw, e)
            schedule_error = 'Некорректная дата отложенной отправки'
        if schedule_error is None and channel == 'smtp':
            schedule_error = 'Отложенная отправка доступна только для канала Exchange'
        if schedule_error is None and is_draft:
            schedule_error = 'Черновики не отправляются по расписанию: снимите «Черновик» или отложенную отправку'
        if schedule_error is None:
            # send_at — местное время пользователя; сравниваем в UTC по его часовому поясу
            send_at_utc = send_at - datetime.timedelta(hours=timezone)
            now_utc = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
            if send_at_utc <= now_utc:
                schedule_error = 'Дата отложенной отправки должна быть в будущем'
        if schedule_error:
            q.put({'type': 'error', 'message': schedule_error})
            return

    total    = len(rows)

    # Attachments: a list of common (uploaded) and individual (per-row) specs
    specs = _att.normalize_specs(data)
    attach_dir_cache: dict = {}   # one folder listing per job, not per row
    limit_bytes = _att.message_limit_bytes(_configured_limit_mb())
    if specs:
        _logger.info('bulk_send: attachments on — %s',
                     '; '.join(_att.spec_label(s, i) for i, s in enumerate(specs)))
        lost = [t for s in specs if s['kind'] == 'common' for t in s['files']
                if not _att.store_path(t)]
        if lost:
            q.put({'type': 'error',
                   'message': 'Общий файл вложения больше недоступен: добавьте его заново'})
            return

    # Prepare static CC / BCC once
    cc  = _m.parse_recipients([cc_raw])  if cc_raw  else []
    bcc = _m.parse_recipients([bcc_raw]) if bcc_raw else []

    # Connect once for all rows
    q.put({'type': 'status',
           'message': 'Подключаюсь к SMTP-серверу…' if channel == 'smtp'
                      else 'Подключаюсь к Exchange…'})
    try:
        conn, creds = _connect(from_email_req, channel)
    except Exception as e:
        q.put({'type': 'error', 'message': str(e)})
        return

    # Determine effective from_email and SMTP-specific settings
    if channel == 'smtp':
        limit_bytes = _att.message_limit_bytes(_configured_limit_mb(), _smtp_size_limit(conn))
        smtp_from      = from_email_req or creds.get('smtp_from_email', '')
        smtp_imap      = creds.get('smtp_imap_enabled', False)
        smtp_imap_host = creds.get('smtp_imap_host', '')
        smtp_imap_port = int(creds.get('smtp_imap_port') or 993)
        smtp_delay_on  = creds.get('smtp_delay_enabled', False)
        smtp_delay_sec = float(creds.get('smtp_delay_seconds') or 1)
        q.put({'type': 'status',
               'message': f'Подключено к {creds.get("smtp_host", "")}:'
                          f'{creds.get("smtp_port") or 587}, вход выполнен. '
                          f'Отправитель: {smtp_from}'})
        # Открываем IMAP если нужно
        imap_conn = None
        if smtp_imap and smtp_imap_host:
            q.put({'type': 'status',
                   'message': f'Подключаюсь к IMAP {smtp_imap_host}:{smtp_imap_port} '
                              f'(копия в «Отправленные»)…'})
            try:
                imap_conn = _m.connect_imap(
                    smtp_imap_host, smtp_imap_port,
                    creds.get('smtp_username', ''),
                    creds.get('smtp_password', ''),
                )
            except Exception as e:
                _logger.warning('bulk_send: IMAP connect failed: %s', e)
                q.put({'type': 'warning',
                       'message': f'Копия в «Отправленные» не сохраняется: {e}'})
        elif smtp_imap:
            q.put({'type': 'warning',
                   'message': 'Копия в «Отправленные» не сохраняется: не указан IMAP-хост'})
    else:
        account = conn

    sent = skipped = errors = 0

    # Helper to resolve the display name from mapping
    fio_col = mapping.get('{{ФИО}}') or 'ФИО'

    for i, row in enumerate(rows):
        if cancel.is_set():
            q.put({'type': 'cancelled', 'sent': sent, 'skipped': skipped, 'errors': errors})
            return

        email = str(row.get(email_col) or '').strip()
        name  = str(row.get(fio_col) or '').strip()

        if skip_no_email and not email:
            skipped += 1
            q.put({'type': 'progress', 'index': i, 'total': total,
                   'name': name, 'email': '(нет email)', 'status': 'skip',
                   'comment': 'Пропущено'})
            continue

        meta = {}            # message_id / server_reply строки (только SMTP)
        saved_sent = None    # None — IMAP не используется; False — копия не сохранена
        q.put({'type': 'status', 'message': f'Отправляю {i + 1} из {total}: {email}'})

        try:
            subject = _substitute(subject_tpl, mapping, row)
            body    = _m.prepare_html_for_email(_substitute(template_html, mapping, row))
            to      = _m.parse_recipients([email])

            # Resolve attachments of this row
            attachments = []
            attach_note = ''
            if specs:
                plan = _att.plan_row(specs, mapping, row, attach_dir_cache)
                action, attach_note = _attachment_action(specs, plan['problems'])
                if action == 'skip':
                    skipped += 1
                    q.put({'type': 'progress', 'index': i, 'total': total,
                           'name': name, 'email': email, 'status': 'skip',
                           'comment': f'Пропущено: {attach_note}'})
                    continue
                if action == 'stop':
                    q.put({'type': 'cancelled', 'sent': sent, 'skipped': skipped, 'errors': errors,
                           'message': f'Остановлено: {attach_note} (получатель {name or email})'})
                    return
                message_bytes = _att.estimated_message_bytes(_att.items_size(plan['items']))
                if message_bytes > limit_bytes:
                    raise ValueError(
                        f'Письмо {_att._mb(message_bytes)} больше допустимых '
                        f'{_att._mb(limit_bytes)}: уберите вложения или уменьшите файлы')
                attachments = _read_attachments(plan['items'])

            if channel == 'smtp':
                # Вложения для SMTP: bytes вместо base64-строки
                smtp_atts = []
                for att in attachments:
                    content = att.get('content', '')
                    raw_bytes = (base64.b64decode(content)
                                 if isinstance(content, str) else content)
                    smtp_atts.append({
                        'name': att['name'],
                        'content': raw_bytes,
                        'mime_type': att.get('mime_type', 'application/octet-stream'),
                    })
                smtp_args = (
                    smtp_from, subject, body,
                    [email],
                    [a.strip() for a in cc_raw.split(',') if a.strip()],
                    [a.strip() for a in bcc_raw.split(',') if a.strip()],
                )
                smtp_kwargs = dict(attachments=smtp_atts, importance=importance,
                                   read_receipt=read_receipt)
                # Сервер мог закрыть сессию (лимит, простой, антиспам): без
                # переподключения все следующие строки падали бы, не доходя до сети.
                if not _smtp_alive(conn):
                    conn = _smtp_reconnect(conn, from_email_req, q)
                try:
                    raw_msg = _m.smtp_send_email(conn, *smtp_args, **smtp_kwargs)
                except (ConnectionError, ValueError) as send_exc:
                    if not _is_retryable_smtp_error(send_exc):
                        raise
                    _logger.warning('bulk_send: SMTP сессия потеряна на строке %d (%s), '
                                    'переподключаюсь и повторяю', i + 1, send_exc)
                    conn = _smtp_reconnect(conn, from_email_req, q)
                    raw_msg = _m.smtp_send_email(conn, *smtp_args, **smtp_kwargs)
                meta = _sent_meta(raw_msg)
                if imap_conn and raw_msg:
                    try:
                        saved_sent = bool(_m.imap_save_sent(imap_conn, raw_msg))
                    except Exception as e:
                        saved_sent = False
                        _logger.warning('bulk_send: imap_save_sent failed: %s', e)
                if smtp_delay_on and smtp_delay_sec > 0:
                    import time as _time
                    _time.sleep(smtp_delay_sec)
            elif is_draft:
                _m.exchange_save_draft(account, subject, body, to, cc, bcc,
                                       attachments=attachments)
            else:
                _m.exchange_send_email(account, subject, body, to, cc, bcc,
                                       attachments=attachments,
                                       send_at=send_at,
                                       timezone=timezone,
                                       importance=importance,
                                       read_receipt=read_receipt)

            sent += 1
            if channel == 'smtp':
                # «Принято сервером» — не «доставлено»: дальше письмо живёт на сервере.
                comment = 'Принято сервером'
                if meta.get('server_reply'):
                    comment += f' · {meta["server_reply"]}'
                if saved_sent is False:
                    comment += ' · копия в «Отправленные» не сохранена'
            else:
                comment = ('Сохранён черновик' if is_draft
                           else f'Запланировано на {send_at.strftime("%d.%m.%Y %H:%M")}' if send_at
                           else 'Отправлено')
            if attach_note:
                comment += f' · {attach_note}'
            q.put({'type': 'progress', 'index': i, 'total': total,
                   'name': name, 'email': email, 'status': 'sent',
                   'comment': comment, 'time': _now_hms(), **meta})

        except Exception as e:
            errors += 1
            q.put({'type': 'progress', 'index': i, 'total': total,
                   'name': name, 'email': email, 'status': 'error',
                   'comment': str(e), 'time': _now_hms(), **meta})
            if stop_on_error:
                q.put({'type': 'cancelled', 'sent': sent, 'skipped': skipped, 'errors': errors})
                return

        if delay > 0:
            cancel.wait(timeout=delay)

    # Закрыть соединения
    if channel == 'smtp':
        try: conn.quit()
        except Exception: pass
        if imap_conn:
            try: imap_conn.logout()
            except Exception: pass

    if not is_draft and sent > 0:
        try:
            _m.log_send(sent)
        except Exception:
            _logger.warning('analytics log_send failed', exc_info=True)

    q.put({'type': 'done', 'sent': sent, 'skipped': skipped, 'errors': errors})
