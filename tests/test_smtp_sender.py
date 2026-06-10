"""
tests/test_smtp_sender.py

Тесты для src/smtp_sender.py:
  - _build_message()      — MIME-структура, заголовки важности, read_receipt
  - connect_smtp()        — STARTTLS (587), Plain (25), ошибки auth/connection
  - smtp_send_email()     — базовая отправка, importance, read_receipt, ошибки
  - connect_imap()        — SSL (993), STARTTLS (143), ошибки
  - imap_save_sent()      — успех, fallback по папкам, полная неудача
  - test_smtp_connection() — проверка подключения

Запуск: pytest tests/test_smtp_sender.py -v
"""
import sys
import os
import smtplib
import imaplib
from email import message_from_bytes
from unittest.mock import MagicMock, patch, call
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from smtp_sender import (
    _build_message,
    connect_smtp,
    smtp_send_email,
    connect_imap,
    imap_save_sent,
    test_smtp_connection,
)


# ─── _build_message ───────────────────────────────────────────────────────────

class TestBuildMessage:

    def _parse(self, from_email='from@test.ru', to=None, cc=None, bcc=None,
               subject='Test', html='<p>Hello</p>', **kw):
        raw = _build_message(from_email, to or ['to@test.ru'], cc or [],
                              bcc or [], subject, html, **kw)
        return raw

    def test_from_header(self):
        msg = self._parse(from_email='sender@corp.ru')
        assert msg['From'] == 'sender@corp.ru'

    def test_to_header(self):
        msg = self._parse(to=['a@test.ru', 'b@test.ru'])
        assert 'a@test.ru' in msg['To']
        assert 'b@test.ru' in msg['To']

    def test_cc_header(self):
        msg = self._parse(cc=['cc@test.ru'])
        assert msg['Cc'] == 'cc@test.ru'

    def test_no_cc_header_when_empty(self):
        msg = self._parse(cc=[])
        assert msg['Cc'] is None

    def test_subject(self):
        msg = self._parse(subject='Важное письмо')
        assert msg['Subject'] == 'Важное письмо'

    def test_content_type_mixed(self):
        msg = self._parse()
        assert msg.get_content_type() == 'multipart/mixed'

    def test_html_body_present(self):
        msg = self._parse(html='<b>Bold</b>')
        raw = msg.as_string()
        assert 'Bold' in raw

    # Importance headers
    def test_importance_high_sets_headers(self):
        msg = self._parse(importance='high')
        assert msg['Importance'] == 'high'
        assert msg['X-Priority'] == '1'
        assert msg['X-MSMail-Priority'] == 'High'

    def test_importance_low_sets_headers(self):
        msg = self._parse(importance='low')
        assert msg['Importance'] == 'low'
        assert msg['X-Priority'] == '5'
        assert msg['X-MSMail-Priority'] == 'Low'

    def test_importance_normal_no_headers(self):
        msg = self._parse(importance='normal')
        assert msg['Importance'] is None
        assert msg['X-Priority'] is None

    def test_importance_default_normal(self):
        msg = self._parse()
        assert msg['Importance'] is None

    # Read receipt
    def test_read_receipt_adds_header(self):
        msg = self._parse(from_email='sender@corp.ru', read_receipt=True)
        assert msg['Disposition-Notification-To'] == 'sender@corp.ru'

    def test_no_read_receipt_by_default(self):
        msg = self._parse()
        assert msg['Disposition-Notification-To'] is None

    # Attachments
    def test_attachment_included(self):
        atts = [{'name': 'file.txt', 'content': b'hello', 'mime_type': 'text/plain'}]
        msg = self._parse(attachments=atts)
        payloads = msg.get_payload()
        assert len(payloads) >= 2  # body + attachment

    def test_no_attachments_single_part(self):
        msg = self._parse(attachments=[])
        assert msg.get_content_type() == 'multipart/mixed'


# ─── connect_smtp ─────────────────────────────────────────────────────────────

class TestConnectSmtp:

    def _make_mock_smtp(self):
        m = MagicMock(spec=smtplib.SMTP)
        m.ehlo.return_value = (250, b'OK')
        m.starttls.return_value = (220, b'Ready')
        m.login.return_value = (235, b'OK')
        return m

    def test_port_587_uses_starttls(self):
        mock_smtp = self._make_mock_smtp()
        with patch('smtp_sender.smtplib.SMTP', return_value=mock_smtp):
            conn = connect_smtp('mail.test.ru', 587, 'user', 'pass')
        mock_smtp.starttls.assert_called_once()
        mock_smtp.login.assert_called_once_with('user', 'pass')
        assert conn is mock_smtp

    def test_port_25_no_starttls(self):
        mock_smtp = self._make_mock_smtp()
        with patch('smtp_sender.smtplib.SMTP', return_value=mock_smtp):
            conn = connect_smtp('mail.test.ru', 25, 'user', 'pass')
        mock_smtp.starttls.assert_not_called()
        mock_smtp.login.assert_called_once_with('user', 'pass')

    def test_auth_error_raises_value_error(self):
        mock_smtp = self._make_mock_smtp()
        mock_smtp.login.side_effect = smtplib.SMTPAuthenticationError(535, b'Auth failed')
        with patch('smtp_sender.smtplib.SMTP', return_value=mock_smtp):
            with pytest.raises(ValueError, match='Неверный логин'):
                connect_smtp('mail.test.ru', 587, 'bad', 'wrong')

    def test_connection_error_raises_connection_error(self):
        with patch('smtp_sender.smtplib.SMTP', side_effect=OSError('Connection refused')):
            with pytest.raises(ConnectionError, match='недоступен'):
                connect_smtp('bad.host', 587, 'u', 'p')

    def test_smtp_connect_error_raises_connection_error(self):
        with patch('smtp_sender.smtplib.SMTP',
                   side_effect=smtplib.SMTPConnectError(421, b'Service unavailable')):
            with pytest.raises(ConnectionError):
                connect_smtp('mail.test.ru', 587, 'u', 'p')

    def test_empty_credentials_no_login_call(self):
        mock_smtp = self._make_mock_smtp()
        with patch('smtp_sender.smtplib.SMTP', return_value=mock_smtp):
            connect_smtp('mail.test.ru', 25, '', '')
        mock_smtp.login.assert_not_called()


# ─── smtp_send_email ──────────────────────────────────────────────────────────

class TestSmtpSendEmail:

    def _make_smtp(self):
        m = MagicMock(spec=smtplib.SMTP)
        m.sendmail.return_value = {}
        return m

    def test_basic_send_calls_sendmail(self):
        smtp = self._make_smtp()
        smtp_send_email(smtp, 'from@t.ru', 'Subj', '<p>Hi</p>', ['to@t.ru'])
        smtp.sendmail.assert_called_once()
        args = smtp.sendmail.call_args[0]
        assert args[0] == 'from@t.ru'
        assert 'to@t.ru' in args[1]

    def test_returns_bytes(self):
        smtp = self._make_smtp()
        result = smtp_send_email(smtp, 'f@t.ru', 'S', '<p/>', ['t@t.ru'])
        assert isinstance(result, bytes)

    def test_cc_included_in_recipients(self):
        smtp = self._make_smtp()
        smtp_send_email(smtp, 'f@t.ru', 'S', '<p/>', ['to@t.ru'],
                        cc=['cc@t.ru'])
        recipients = smtp.sendmail.call_args[0][1]
        assert 'cc@t.ru' in recipients

    def test_bcc_included_in_recipients(self):
        smtp = self._make_smtp()
        smtp_send_email(smtp, 'f@t.ru', 'S', '<p/>', ['to@t.ru'],
                        bcc=['bcc@t.ru'])
        recipients = smtp.sendmail.call_args[0][1]
        assert 'bcc@t.ru' in recipients

    def test_no_recipients_raises(self):
        smtp = self._make_smtp()
        with pytest.raises(ValueError, match='получатели'):
            smtp_send_email(smtp, 'f@t.ru', 'S', '<p/>', [])

    def test_importance_high_in_raw_message(self):
        smtp = self._make_smtp()
        raw = smtp_send_email(smtp, 'f@t.ru', 'S', '<p/>', ['t@t.ru'],
                              importance='high')
        msg = message_from_bytes(raw)
        assert msg['X-Priority'] == '1'
        assert msg['Importance'] == 'high'

    def test_importance_low_in_raw_message(self):
        smtp = self._make_smtp()
        raw = smtp_send_email(smtp, 'f@t.ru', 'S', '<p/>', ['t@t.ru'],
                              importance='low')
        msg = message_from_bytes(raw)
        assert msg['X-Priority'] == '5'

    def test_importance_normal_no_priority_header(self):
        smtp = self._make_smtp()
        raw = smtp_send_email(smtp, 'f@t.ru', 'S', '<p/>', ['t@t.ru'],
                              importance='normal')
        msg = message_from_bytes(raw)
        assert msg['X-Priority'] is None

    def test_read_receipt_header_in_raw(self):
        smtp = self._make_smtp()
        raw = smtp_send_email(smtp, 'sender@t.ru', 'S', '<p/>', ['t@t.ru'],
                              read_receipt=True)
        msg = message_from_bytes(raw)
        assert msg['Disposition-Notification-To'] == 'sender@t.ru'

    def test_no_read_receipt_by_default(self):
        smtp = self._make_smtp()
        raw = smtp_send_email(smtp, 'f@t.ru', 'S', '<p/>', ['t@t.ru'])
        msg = message_from_bytes(raw)
        assert msg['Disposition-Notification-To'] is None

    def test_recipients_refused_raises_value_error(self):
        smtp = self._make_smtp()
        smtp.sendmail.side_effect = smtplib.SMTPRecipientsRefused({'to@t.ru': (550, b'No such user')})
        with pytest.raises(ValueError, match='отклонён'):
            smtp_send_email(smtp, 'f@t.ru', 'S', '<p/>', ['to@t.ru'])

    def test_server_disconnected_raises_connection_error(self):
        smtp = self._make_smtp()
        smtp.sendmail.side_effect = smtplib.SMTPServerDisconnected('Lost connection')
        with pytest.raises(ConnectionError):
            smtp_send_email(smtp, 'f@t.ru', 'S', '<p/>', ['to@t.ru'])


# ─── connect_imap ─────────────────────────────────────────────────────────────

class TestConnectImap:

    def _make_imap_ssl(self):
        m = MagicMock(spec=imaplib.IMAP4_SSL)
        m.login.return_value = ('OK', [b'Logged in'])
        return m

    def _make_imap(self):
        m = MagicMock(spec=imaplib.IMAP4)
        m.starttls.return_value = None
        m.login.return_value = ('OK', [b'Logged in'])
        return m

    def test_port_993_uses_ssl(self):
        mock_imap = self._make_imap_ssl()
        with patch('smtp_sender.imaplib.IMAP4_SSL', return_value=mock_imap):
            conn = connect_imap('mail.test.ru', 993, 'user', 'pass')
        mock_imap.login.assert_called_once_with('user', 'pass')
        assert conn is mock_imap

    def test_port_143_uses_starttls(self):
        mock_imap = self._make_imap()
        with patch('smtp_sender.imaplib.IMAP4', return_value=mock_imap):
            conn = connect_imap('mail.test.ru', 143, 'user', 'pass')
        mock_imap.starttls.assert_called_once()
        mock_imap.login.assert_called_once_with('user', 'pass')

    def test_imap_error_raises_connection_error(self):
        with patch('smtp_sender.imaplib.IMAP4_SSL',
                   side_effect=imaplib.IMAP4.error('Connection failed')):
            with pytest.raises(ConnectionError):
                connect_imap('bad.host', 993, 'u', 'p')

    def test_os_error_raises_connection_error(self):
        with patch('smtp_sender.imaplib.IMAP4_SSL', side_effect=OSError('Refused')):
            with pytest.raises(ConnectionError):
                connect_imap('bad.host', 993, 'u', 'p')


# ─── imap_save_sent ───────────────────────────────────────────────────────────

class TestImapSaveSent:

    def test_saves_to_sent_folder(self):
        imap = MagicMock()
        imap.append.return_value = ('OK', [b'1'])
        raw = b'raw message bytes'
        imap_save_sent(imap, raw, folder='Sent')
        imap.append.assert_called()
        args = imap.append.call_args[0]
        assert b'raw message bytes' in args

    def test_fallback_to_alternate_folder(self):
        imap = MagicMock()
        # Первый вызов (Sent) фейлит, второй (INBOX.Sent) — OK
        imap.append.side_effect = [
            Exception('No such mailbox'),
            ('OK', [b'1']),
        ]
        imap_save_sent(imap, b'msg', folder='Sent')
        assert imap.append.call_count == 2

    def test_all_folders_fail_no_exception(self):
        imap = MagicMock()
        imap.append.side_effect = Exception('Always fails')
        # Не должно бросать исключение — просто логирует
        imap_save_sent(imap, b'msg')

    def test_seen_flag_set(self):
        imap = MagicMock()
        imap.append.return_value = ('OK', [b'1'])
        imap_save_sent(imap, b'msg')
        args = imap.append.call_args[0]
        assert '\\Seen' in args


# ─── test_smtp_connection ─────────────────────────────────────────────────────

class TestTestSmtpConnection:

    def test_success_does_not_raise(self):
        mock_smtp = MagicMock()
        mock_smtp.verify.return_value = (250, b'OK')
        with patch('smtp_sender.connect_smtp', return_value=mock_smtp):
            test_smtp_connection('mail.test.ru', 587, 'user', 'pass', 'from@test.ru')
        mock_smtp.quit.assert_called_once()

    def test_verify_exception_does_not_raise(self):
        mock_smtp = MagicMock()
        mock_smtp.verify.side_effect = smtplib.SMTPException('VRFY disabled')
        with patch('smtp_sender.connect_smtp', return_value=mock_smtp):
            test_smtp_connection('mail.test.ru', 587, 'user', 'pass', 'from@test.ru')
        mock_smtp.quit.assert_called_once()

    def test_connect_error_propagates(self):
        with patch('smtp_sender.connect_smtp',
                   side_effect=ConnectionError('Unreachable')):
            with pytest.raises(ConnectionError):
                test_smtp_connection('bad.host', 587, 'u', 'p', 'f@t.ru')

    def test_auth_error_propagates(self):
        with patch('smtp_sender.connect_smtp',
                   side_effect=ValueError('Неверный логин или пароль SMTP')):
            with pytest.raises(ValueError, match='Неверный'):
                test_smtp_connection('mail.test.ru', 587, 'bad', 'wrong', 'f@t.ru')
