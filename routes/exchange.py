"""
Flask blueprint: Exchange / EWS credentials and mail/meeting sending.

.. module:: routes.exchange
   :synopsis: Endpoints for managing Exchange credentials and sending
              HTML emails and calendar meeting invitations via EWS.

Routes:
    - GET  /api/credentials/status  — check saved Exchange credentials
    - POST /api/credentials/save    — save (encrypted) Exchange credentials
    - POST /api/credentials/test    — test Exchange connection (real EWS call)
    - POST /api/send/email          — send an HTML email via Exchange
    - POST /api/send/meeting        — create a calendar meeting via Exchange
"""

import subprocess
import sys

from flask import Blueprint, current_app, jsonify, request

import app as _m  # module reference — gives live access to all app.py globals

bp = Blueprint('exchange', __name__)


@bp.route('/api/credentials/detect-auth', methods=['GET'])
def api_detect_auth():
    """Проверяет доступность Kerberos на текущей машине.

    1. Проверяет, установлен ли requests-kerberos (ImportError → NTLM).
    2. На Linux дополнительно проверяет пакет gssapi — он обязателен для
       requests-kerberos на Linux (на Windows используется встроенный SSPI).
    3. Запускает klist — если тикет есть, возвращает kerberos: true.
    """
    try:
        import importlib.util

        kerberos_pkg = importlib.util.find_spec('requests_kerberos')
        if kerberos_pkg is None:
            return jsonify({'kerberos': False, 'reason': 'requests-kerberos not installed'})

        # On Linux requests-kerberos delegates to the gssapi Python package.
        # On Windows it uses SSPI directly and gssapi is not required.
        # Use actual import (not find_spec) — find_spec returns non-None even
        # for partially-bundled packages where Cython extensions are missing.
        if sys.platform != 'win32':
            try:
                import gssapi  # noqa: F401
            except Exception:
                return jsonify({'kerberos': False, 'reason': 'gssapi not functional'})

        result = subprocess.run(
            ['klist'],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return jsonify({'kerberos': True})
        return jsonify({'kerberos': False, 'reason': 'no active Kerberos ticket'})
    except FileNotFoundError:
        return jsonify({'kerberos': False, 'reason': 'klist not found'})
    except subprocess.TimeoutExpired:
        return jsonify({'kerberos': False, 'reason': 'klist timed out'})
    except Exception as e:
        current_app.logger.warning('detect-auth error: %s', e)
        return jsonify({'kerberos': False, 'reason': str(e)})


@bp.route('/api/credentials/status', methods=['GET'])
def api_credentials_status():
    """Проверяет наличие сохранённых учётных данных Exchange."""
    try:
        path = _m.get_credentials_path()
        exists = _m.credentials_exist(path)
        if exists:
            creds = _m.load_credentials(path)
            return jsonify({
                'exists':          True,
                'has_password':    bool(creds and creds.get('password')),
                'username':        creds.get('username') if creds else None,
                'server':          creds.get('server') if creds else None,
                'from_email':      creds.get('from_email') if creds else None,
                'default_senders': creds.get('default_senders') if creds else [],
                'auth_type':       (creds.get('auth_type') or 'ntlm') if creds else 'ntlm',
            })
        return jsonify({'exists': False, 'has_password': False,
                        'username': None, 'server': None,
                        'from_email': None, 'default_senders': [],
                        'default_server': _m._DEFAULT_EXCHANGE_SERVER or None})
    except Exception as e:
        current_app.logger.error('credentials_status error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/credentials/save', methods=['POST'])
def api_credentials_save():
    """Сохраняет учётные данные Exchange (пароль шифруется)."""
    try:
        data = request.json or {}
        server = str(data.get('server') or '').strip()
        username = str(data.get('username') or '').strip()
        password = str(data.get('password') or '').strip()
        from_email = str(data.get('from_email') or '').strip()
        default_senders = data.get('default_senders') or []
        auth_type = str(data.get('auth_type') or 'ntlm').lower()
        path = _m.get_credentials_path()

        # Opening the settings form does not repopulate the password field.
        # Reuse the existing secret when the username stays unchanged and the
        # user saved other settings without entering a new password.
        if auth_type != 'kerberos' and not password and _m.credentials_exist(path):
            try:
                existing_creds = _m.load_credentials(path)
                if (existing_creds and existing_creds.get('password')
                        and existing_creds.get('username') == username):
                    password = existing_creds['password']
            except RuntimeError:
                pass  # corrupted / foreign-machine credentials — user must re-enter password

        ok, err = _m.validate_credentials_data({
            'server': server, 'username': username,
            'password': password, 'from_email': from_email,
            'auth_type': auth_type,
        })
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        _m.save_credentials(path, server, username, password,
                            from_email, default_senders, auth_type=auth_type)
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.error('credentials_save error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/credentials/test', methods=['POST'])
def api_credentials_test():
    """Проверяет подключение к Exchange, выполняя реальный EWS-запрос."""
    try:
        path = _m.get_credentials_path()
        data = request.json or {}
        server     = str(data.get('server')     or '').strip()
        username   = str(data.get('username')   or '').strip()
        password   = str(data.get('password')   or '').strip()
        from_email = str(data.get('from_email') or '').strip()
        auth_type  = str(data.get('auth_type')  or 'ntlm').lower()

        if auth_type != 'kerberos' and not password and _m.credentials_exist(path):
            try:
                existing = _m.load_credentials(path)
                if existing and existing.get('username') == username:
                    password = existing['password']
            except RuntimeError:
                pass

        if not server or not from_email:
            return jsonify({'success': False, 'error': 'Заполните поля: сервер и email отправителя'}), 400
        if auth_type != 'kerberos' and (not username or not password):
            return jsonify({'success': False, 'error': 'Заполните поля: логин и пароль'}), 400

        account = _m.connect_exchange(server, username, password, from_email, auth_type=auth_type)
        try:
            account.inbox.refresh()  # первый реальный EWS-запрос — проверяет аутентификацию
        except (ValueError, ConnectionError, RuntimeError):
            raise
        except Exception as e:
            _m._wrap_exchange_error(e)  # конвертирует в ValueError/ConnectionError/RuntimeError
        current_app.logger.info('credentials_test: OK server=%s username=%s', server, username)
        return jsonify({'success': True})

    except ValueError as e:
        current_app.logger.warning('credentials_test auth error: %s', e)
        return jsonify({'success': False, 'error': str(e)}), 401
    except ConnectionError as e:
        current_app.logger.warning('credentials_test connection error: %s', e)
        return jsonify({'success': False, 'error': str(e)}), 503
    except RuntimeError as e:
        current_app.logger.error('credentials_test exchange error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        current_app.logger.error('credentials_test unexpected error: %s', e, exc_info=True)
        return jsonify({'success': False,
                        'error': f'Внутренняя ошибка: {type(e).__name__}'}), 500


@bp.route('/api/send/email', methods=['POST'])
def api_send_email():
    """Отправляет HTML-письмо через Exchange."""
    try:
        path = _m.get_credentials_path()
        if not _m.credentials_exist(path):
            return jsonify({'success': False, 'error': 'Учётные данные не настроены'}), 401

        data = request.json or {}
        subject = str(data.get('subject') or '').strip()
        to = _m.parse_recipients(data.get('to',  []))
        cc = _m.parse_recipients(data.get('cc',  []))
        bcc = _m.parse_recipients(data.get('bcc', []))
        from_email = str(data.get('from_email') or '').strip()

        if not subject:
            return jsonify({'success': False, 'error': 'Тема обязательна'}), 400
        if not to and not cc and not bcc:
            return jsonify({'success': False, 'error': 'Укажите хотя бы одного получателя'}), 400

        creds = _m.load_credentials(path)
        if not creds:
            current_app.logger.error('send_email: load_credentials returned None for %s', path)
            return jsonify({'success': False,
                            'error': 'Не удалось загрузить учётные данные'}), 401
        account = _m.connect_exchange(
            creds['server'], creds['username'], creds['password'],
            from_email or creds['from_email'],
            auth_type=creds.get('auth_type', 'ntlm'),
        )
        html_body = _m.prepare_html_for_email(data.get('html_body', ''))
        attachments = data.get('attachments', [])
        _m.exchange_send_email(
            account, subject, html_body, to, cc, bcc,
            attachments=attachments
        )
        return jsonify({'success': True})

    except ValueError as e:
        current_app.logger.warning('send_email auth/validation error: %s', e)
        return jsonify({'success': False, 'error': str(e)}), 401
    except ConnectionError as e:
        current_app.logger.warning('send_email connection error: %s', e)
        return jsonify({'success': False, 'error': str(e)}), 503
    except RuntimeError as e:
        current_app.logger.error('send_email exchange error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        current_app.logger.error('send_email unexpected error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': f'Внутренняя ошибка: {type(e).__name__}'}), 500


@bp.route('/api/send/meeting', methods=['POST'])
def api_send_meeting():
    """Создаёт встречу в Exchange Calendar."""
    try:
        path = _m.get_credentials_path()
        if not _m.credentials_exist(path):
            return jsonify({'success': False, 'error': 'Учётные данные не настроены'}), 401

        data = request.json or {}
        subject = str(data.get('subject') or '').strip()
        to = _m.parse_recipients(data.get('to',  []))
        cc = _m.parse_recipients(data.get('cc',  []))
        bcc = _m.parse_recipients(data.get('bcc', []))
        from_email = str(data.get('from_email') or '').strip()
        location = str(data.get('location') or '').strip()
        start_raw = str(data.get('start_dt') or '').strip()
        end_raw = str(data.get('end_dt') or '').strip()

        if not subject:
            return jsonify({'success': False, 'error': 'Тема обязательна'}), 400
        if not to and not bcc:
            return jsonify({'success': False, 'error': 'Укажите хотя бы одного участника'}), 400
        if not start_raw or not end_raw:
            return jsonify({'success': False, 'error': 'Дата и время обязательны'}), 400

        try:
            start_dt = _m.parse_datetime(start_raw)
            end_dt = _m.parse_datetime(end_raw)
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400

        if end_dt <= start_dt:
            return jsonify({
                'success': False,
                'error': 'Время окончания должно быть позже начала'
            }), 400

        creds = _m.load_credentials(path)
        if not creds:
            current_app.logger.error('send_meeting: load_credentials returned None for %s', path)
            return jsonify({'success': False,
                            'error': 'Не удалось загрузить учётные данные'}), 401
        account = _m.connect_exchange(
            creds['server'], creds['username'], creds['password'],
            from_email or creds['from_email'],
            auth_type=creds.get('auth_type', 'ntlm'),
        )
        html_body = _m.prepare_html_for_email(data.get('html_body', ''))
        attachments = data.get('attachments', [])
        _m.exchange_send_meeting(
            account, subject, html_body, to, cc, bcc,
            location, start_dt, end_dt,
            attachments=attachments
        )
        return jsonify({'success': True})

    except ValueError as e:
        current_app.logger.warning('send_meeting auth/validation error: %s', e)
        return jsonify({'success': False, 'error': str(e)}), 401
    except ConnectionError as e:
        current_app.logger.warning('send_meeting connection error: %s', e)
        return jsonify({'success': False, 'error': str(e)}), 503
    except RuntimeError as e:
        current_app.logger.error('send_meeting exchange error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        current_app.logger.error('send_meeting unexpected error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': f'Внутренняя ошибка: {type(e).__name__}'}), 500
