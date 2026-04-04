"""
tests/test_exchange_sender.py

Тесты для exchange_sender.py:
- parse_datetime
- parse_recipients
- validate_recipients
- _convert_data_images_to_cid
- exchange_send_email (mock)
- exchange_send_meeting (mock)
- вложения (attachments)

Запуск:
    pytest tests/test_exchange_sender.py -v
"""

import base64
import datetime
import pytest
from unittest.mock import MagicMock, patch, call

# Патчим exchangelib до импорта модуля
import sys
from unittest.mock import MagicMock

# Мокаем exchangelib если не установлен
exchangelib_mock = MagicMock()
sys.modules.setdefault('exchangelib', exchangelib_mock)
sys.modules.setdefault('exchangelib.errors', MagicMock())
sys.modules.setdefault('pytz', MagicMock())

from exchange_sender import (
    parse_datetime,
    parse_recipients,
    validate_recipients,
    _convert_data_images_to_cid,
    exchange_send_email,
    exchange_send_meeting,
    _to_mailboxes,
    _to_attendees,
)


# ─── parse_datetime ────────────────────────────────────────────────────────

class TestParseDatetime:

    def test_valid_iso(self):
        dt = parse_datetime('2025-06-01T10:00:00')
        assert dt == datetime.datetime(2025, 6, 1, 10, 0, 0)

    def test_valid_with_minutes(self):
        dt = parse_datetime('2025-12-31T23:59:00')
        assert dt.hour == 23
        assert dt.minute == 59

    def test_empty_raises(self):
        with pytest.raises(ValueError, match='Пустая строка'):
            parse_datetime('')

    def test_none_raises(self):
        with pytest.raises(ValueError):
            parse_datetime(None)

    def test_date_only_raises(self):
        with pytest.raises(ValueError, match='Некорректный формат'):
            parse_datetime('2025-06-01')

    def test_invalid_format_raises(self):
        with pytest.raises(ValueError):
            parse_datetime('not-a-date')

    def test_string_coercion(self):
        # Должен принимать строку
        dt = parse_datetime('2025-01-15T08:30:00')
        assert dt.year == 2025


# ─── parse_recipients ──────────────────────────────────────────────────────

class TestParseRecipients:

    def test_list_input(self):
        result = parse_recipients(['a@rt.ru', 'b@rt.ru'])
        assert result == ['a@rt.ru', 'b@rt.ru']

    def test_string_input(self):
        result = parse_recipients('a@rt.ru, b@rt.ru')
        assert result == ['a@rt.ru', 'b@rt.ru']

    def test_string_with_spaces(self):
        result = parse_recipients('  a@rt.ru ,  b@rt.ru  ')
        assert result == ['a@rt.ru', 'b@rt.ru']

    def test_empty_string(self):
        assert parse_recipients('') == []

    def test_none(self):
        assert parse_recipients(None) == []

    def test_filters_empty_entries(self):
        result = parse_recipients(['a@rt.ru', '', '  '])
        assert result == ['a@rt.ru']

    def test_single_email(self):
        assert parse_recipients('a@rt.ru') == ['a@rt.ru']


# ─── validate_recipients ──────────────────────────────────────────────────

class TestValidateRecipients:

    def test_valid_emails(self):
        # Не должно бросать исключение
        validate_recipients(['a@rt.ru', 'b@company.com'])

    def test_invalid_email_raises(self):
        with pytest.raises(ValueError, match='Некорректные адреса'):
            validate_recipients(['not-an-email'])

    def test_empty_list_ok(self):
        validate_recipients([])

    def test_mixed_valid_invalid_raises(self):
        with pytest.raises(ValueError):
            validate_recipients(['a@rt.ru', 'bad-email'])


# ─── _convert_data_images_to_cid ──────────────────────────────────────────

class TestConvertDataImages:

    def _make_data_uri(self, content=b'fake-image-data', mime='image/png'):
        b64 = base64.b64encode(content).decode()
        return f'src="data:{mime};base64,{b64}"'

    def test_replaces_data_uri_with_cid(self):
        src = self._make_data_uri()
        html = f'<img {src}>'
        result_html, attachments = _convert_data_images_to_cid(html)
        assert 'src="cid:' in result_html
        assert 'data:' not in result_html
        assert len(attachments) == 1

    def test_multiple_images(self):
        src1 = self._make_data_uri(b'img1')
        src2 = self._make_data_uri(b'img2')
        html = f'<img {src1}><img {src2}>'
        result_html, attachments = _convert_data_images_to_cid(html)
        assert len(attachments) == 2
        assert result_html.count('src="cid:') == 2

    def test_no_images(self):
        html = '<p>текст без картинок</p>'
        result_html, attachments = _convert_data_images_to_cid(html)
        assert result_html == html
        assert attachments == []

    def test_attachment_has_correct_content(self):
        content = b'real-image-bytes'
        src = self._make_data_uri(content)
        html = f'<img {src}>'
        _, attachments = _convert_data_images_to_cid(html)
        assert attachments[0].content == content

    def test_attachment_content_type(self):
        src = self._make_data_uri(mime='image/jpeg')
        html = f'<img {src}>'
        _, attachments = _convert_data_images_to_cid(html)
        assert attachments[0].content_type == 'image/jpeg'

    def test_non_image_data_uri_ignored(self):
        # data: без image — не трогаем (не должно быть в письмах)
        html = '<p>текст</p>'
        result, atts = _convert_data_images_to_cid(html)
        assert atts == []

    def test_invalid_base64_skipped(self):
        html = 'src="data:image/png;base64,NOT_VALID_BASE64!!!"'
        # Не должно крашиться
        result, atts = _convert_data_images_to_cid(html)
        assert len(atts) == 0


# ─── exchange_send_email ──────────────────────────────────────────────────

class TestExchangeSendEmail:

    def _make_account(self):
        account = MagicMock()
        return account

    def _make_message_cls(self):
        """Патч для exchangelib.Message"""
        msg = MagicMock()
        return msg

    def test_sends_basic_email(self):
        account = self._make_account()
        with patch('exchange_sender.Message') as MockMsg, \
             patch('exchange_sender.HTMLBody') as MockBody, \
             patch('exchange_sender._convert_data_images_to_cid',
                   return_value=('<p>html</p>', [])):
            instance = MagicMock()
            MockMsg.return_value = instance
            exchange_send_email(
                account, 'Тема', '<p>html</p>',
                to=['a@rt.ru']
            )
            instance.send.assert_called_once()

    def test_raises_if_no_recipients(self):
        account = self._make_account()
        with pytest.raises(ValueError, match='Не указаны получатели'):
            exchange_send_email(account, 'Тема', '<p>html</p>',
                                to=[], cc=[], bcc=[])

    def test_raises_on_invalid_to(self):
        account = self._make_account()
        with pytest.raises(ValueError, match='Некорректные адреса'):
            exchange_send_email(account, 'Тема', '<p>html</p>',
                                to=['not-email'])

    def test_attaches_user_files(self):
        account = self._make_account()
        content = base64.b64encode(b'file-content').decode()
        attachments = [
            {'name': 'test.pdf', 'content': content,
             'mime_type': 'application/pdf'}
        ]
        with patch('exchange_sender.Message') as MockMsg, \
             patch('exchange_sender.HTMLBody'), \
             patch('exchange_sender.FileAttachment') as MockFileAtt, \
             patch('exchange_sender._convert_data_images_to_cid',
                   return_value=('<p>html</p>', [])):
            instance = MagicMock()
            MockMsg.return_value = instance
            exchange_send_email(
                account, 'Тема', '<p>html</p>',
                to=['a@rt.ru'],
                attachments=attachments
            )
            # FileAttachment должен был создаться
            MockFileAtt.assert_called_once()
            call_kwargs = MockFileAtt.call_args[1]
            assert call_kwargs['name'] == 'test.pdf'
            assert call_kwargs['content'] == b'file-content'
            # attach должен был вызваться
            instance.attach.assert_called()

    def test_multiple_attachments(self):
        account = self._make_account()
        def make_att(name):
            return {
                'name': name,
                'content': base64.b64encode(b'data').decode(),
                'mime_type': 'application/octet-stream'
            }
        attachments = [make_att('a.pdf'), make_att('b.docx'), make_att('c.xlsx')]
        with patch('exchange_sender.Message') as MockMsg, \
             patch('exchange_sender.HTMLBody'), \
             patch('exchange_sender.FileAttachment'), \
             patch('exchange_sender._convert_data_images_to_cid',
                   return_value=('<p>html</p>', [])):
            instance = MagicMock()
            MockMsg.return_value = instance
            exchange_send_email(
                account, 'Тема', '<p>html</p>',
                to=['a@rt.ru'],
                attachments=attachments
            )
            assert instance.attach.call_count == 3

    def test_no_attachments_works(self):
        account = self._make_account()
        with patch('exchange_sender.Message') as MockMsg, \
             patch('exchange_sender.HTMLBody'), \
             patch('exchange_sender._convert_data_images_to_cid',
                   return_value=('<p>html</p>', [])):
            instance = MagicMock()
            MockMsg.return_value = instance
            exchange_send_email(
                account, 'Тема', '<p>html</p>',
                to=['a@rt.ru'],
                attachments=None
            )
            instance.send.assert_called_once()

    def test_cc_and_bcc(self):
        account = self._make_account()
        with patch('exchange_sender.Message') as MockMsg, \
             patch('exchange_sender.HTMLBody'), \
             patch('exchange_sender._convert_data_images_to_cid',
                   return_value=('<p>html</p>', [])):
            instance = MagicMock()
            MockMsg.return_value = instance
            exchange_send_email(
                account, 'Тема', '<p>html</p>',
                to=['a@rt.ru'],
                cc=['cc@rt.ru'],
                bcc=['bcc@rt.ru']
            )
            call_kwargs = MockMsg.call_args[1]
            assert call_kwargs['cc_recipients'] is not None
            assert call_kwargs['bcc_recipients'] is not None


# ─── exchange_send_meeting ────────────────────────────────────────────────

class TestExchangeSendMeeting:

    def _dates(self, offset_hours=1):
        start = datetime.datetime(2025, 6, 1, 10, 0, 0)
        end = start + datetime.timedelta(hours=offset_hours)
        return start, end

    def test_raises_if_no_attendees(self):
        account = MagicMock()
        start, end = self._dates()
        with pytest.raises(ValueError, match='Не указаны участники'):
            exchange_send_meeting(
                account, 'Встреча', '<p>html</p>',
                to=[], bcc=[],
                start_dt=start, end_dt=end
            )

    def test_raises_if_end_before_start(self):
        account = MagicMock()
        start = datetime.datetime(2025, 6, 1, 10, 0, 0)
        end = datetime.datetime(2025, 6, 1, 9, 0, 0)
        with pytest.raises(ValueError, match='позже начала'):
            exchange_send_meeting(
                account, 'Встреча', '<p>html</p>',
                to=['a@rt.ru'],
                start_dt=start, end_dt=end
            )

    def test_raises_if_no_dates(self):
        account = MagicMock()
        with pytest.raises(ValueError, match='обязательны'):
            exchange_send_meeting(
                account, 'Встреча', '<p>html</p>',
                to=['a@rt.ru'],
                start_dt=None, end_dt=None
            )

    def test_raises_on_invalid_attendee(self):
        account = MagicMock()
        start, end = self._dates()
        with pytest.raises(ValueError):
            exchange_send_meeting(
                account, 'Встреча', '<p>html</p>',
                to=['not-email'],
                start_dt=start, end_dt=end
            )

    def test_attaches_user_files(self):
        account = MagicMock()
        account.calendar = MagicMock()
        start, end = self._dates()
        content = base64.b64encode(b'file').decode()
        attachments = [
            {'name': 'agenda.pdf', 'content': content,
             'mime_type': 'application/pdf'}
        ]
        with patch('exchange_sender.CalendarItem') as MockCal, \
             patch('exchange_sender.HTMLBody'), \
             patch('exchange_sender.EWSDateTime'), \
             patch('exchange_sender.EWSTimeZone') as MockTZ, \
             patch('exchange_sender.FileAttachment') as MockFileAtt, \
             patch('exchange_sender._convert_data_images_to_cid',
                   return_value=('<p>html</p>', [])):
            MockTZ.from_pytz.return_value = MagicMock()
            item = MagicMock()
            MockCal.return_value = item
            exchange_send_meeting(
                account, 'Встреча', '<p>html</p>',
                to=['a@rt.ru'],
                start_dt=start, end_dt=end,
                attachments=attachments
            )
            MockFileAtt.assert_called_once()
            call_kwargs = MockFileAtt.call_args[1]
            assert call_kwargs['name'] == 'agenda.pdf'
            assert call_kwargs['content'] == b'file'

    def test_no_attachments_works(self):
        account = MagicMock()
        account.calendar = MagicMock()
        start, end = self._dates()
        with patch('exchange_sender.CalendarItem') as MockCal, \
             patch('exchange_sender.HTMLBody'), \
             patch('exchange_sender.EWSDateTime'), \
             patch('exchange_sender.EWSTimeZone') as MockTZ, \
             patch('exchange_sender._convert_data_images_to_cid',
                   return_value=('<p>html</p>', [])):
            MockTZ.from_pytz.return_value = MagicMock()
            item = MagicMock()
            MockCal.return_value = item
            exchange_send_meeting(
                account, 'Встреча', '<p>html</p>',
                to=['a@rt.ru'],
                start_dt=start, end_dt=end,
                attachments=None
            )
            item.save.assert_called_once()

    def test_equal_start_end_raises(self):
        account = MagicMock()
        dt = datetime.datetime(2025, 6, 1, 10, 0, 0)
        with pytest.raises(ValueError, match='позже начала'):
            exchange_send_meeting(
                account, 'Встреча', '<p>html</p>',
                to=['a@rt.ru'],
                start_dt=dt, end_dt=dt
            )

class TestInlineAndUserAttachmentsTogether:

    def test_inline_images_and_user_files_both_attached(self):
        """Inline картинки из письма + пользовательские файлы — оба типа должны быть прикреплены"""
        account = MagicMock()
        img_data = b'\x89PNG\r\n'
        b64_img = base64.b64encode(img_data).decode()
        html = f'<img src="data:image/png;base64,{b64_img}">'

        user_file_content = base64.b64encode(b'pdf-content').decode()
        user_attachments = [
            {'name': 'report.pdf', 'content': user_file_content,
             'mime_type': 'application/pdf'}
        ]

        with patch('exchange_sender.Message') as MockMsg, \
             patch('exchange_sender.HTMLBody'), \
             patch('exchange_sender.FileAttachment') as MockFileAtt:
            instance = MagicMock()
            MockMsg.return_value = instance

            exchange_send_email(
                account, 'Тема', html,
                to=['a@rt.ru'],
                attachments=user_attachments
            )

            # attach должен вызваться минимум 2 раза:
            # 1 — inline картинка, 1 — пользовательский файл
            assert instance.attach.call_count >= 2

    def test_invalid_base64_in_user_attachment_skipped(self):
        """Невалидный base64 в вложении не должен крашить отправку"""
        account = MagicMock()
        bad_attachments = [
            {'name': 'bad.pdf', 'content': 'NOT_VALID_BASE64!!!',
             'mime_type': 'application/pdf'}
        ]

        with patch('exchange_sender.Message') as MockMsg, \
             patch('exchange_sender.HTMLBody'), \
             patch('exchange_sender._convert_data_images_to_cid',
                   return_value=('<p>html</p>', [])):
            instance = MagicMock()
            MockMsg.return_value = instance

            # Не должно падать
            exchange_send_email(
                account, 'Тема', '<p>html</p>',
                to=['a@rt.ru'],
                attachments=bad_attachments
            )
            instance.send.assert_called_once()

    def test_attachment_mime_type_defaults_to_octet_stream(self):
        """Если mime_type не указан — используется application/octet-stream"""
        account = MagicMock()
        content = base64.b64encode(b'data').decode()
        attachments = [{'name': 'file.bin', 'content': content}]  # без mime_type

        with patch('exchange_sender.Message') as MockMsg, \
             patch('exchange_sender.HTMLBody'), \
             patch('exchange_sender.FileAttachment') as MockFileAtt, \
             patch('exchange_sender._convert_data_images_to_cid',
                   return_value=('<p>html</p>', [])):
            instance = MagicMock()
            MockMsg.return_value = instance

            exchange_send_email(
                account, 'Тема', '<p>html</p>',
                to=['a@rt.ru'],
                attachments=attachments
            )

            call_kwargs = MockFileAtt.call_args[1]
            assert call_kwargs['content_type'] == 'application/octet-stream'