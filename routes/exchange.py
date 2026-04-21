"""
Flask blueprint: Exchange / EWS credentials and mail/meeting sending.

.. module:: routes.exchange
   :synopsis: Endpoints for managing Exchange credentials and sending
              HTML emails and calendar meeting invitations via EWS.

Routes:
    - GET  /api/credentials/status  — check saved Exchange credentials
    - POST /api/credentials/save    — save (encrypted) Exchange credentials
    - POST /api/send/email          — send an HTML email via Exchange
    - POST /api/send/meeting        — create a calendar meeting via Exchange
"""

from flask import Blueprint, current_app, jsonify, request

import app as _m  # module reference — gives live access to all app.py globals

bp = Blueprint('exchange', __name__)


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
        path = _m.get_credentials_path()

        # Opening the settings form does not repopulate the password field.
        # Reuse the existing secret when the username stays unchanged and the
        # user saved other settings without entering a new password.
        if not password and _m.credentials_exist(path):
            existing_creds = _m.load_credentials(path)
            if (existing_creds and existing_creds.get('password')
                    and existing_creds.get('username') == username):
                password = existing_creds['password']

        ok, err = _m.validate_credentials_data({
            'server': server, 'username': username,
            'password': password, 'from_email': from_email,
        })
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        _m.save_credentials(path, server, username, password,
                            from_email, default_senders)
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.error('credentials_save error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


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
            from_email or creds['from_email']
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
            from_email or creds['from_email']
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
