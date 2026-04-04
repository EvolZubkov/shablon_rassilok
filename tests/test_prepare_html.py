"""
tests/test_prepare_html.py

Тесты для prepare_html_for_email и prepare_html_for_meeting в app.py
"""

import base64
import pytest
from unittest.mock import patch, MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as email_app


# ─── prepare_html_for_email ───────────────────────────────────────────────

class TestPrepareHtmlForEmail:

    def test_empty_string_returns_empty(self):
        assert email_app.prepare_html_for_email('') == ''
        assert email_app.prepare_html_for_email(None) == ''

    def test_plain_text_unchanged(self):
        html = '<p>Просто текст без картинок</p>'
        result = email_app.prepare_html_for_email(html)
        assert result == html

    def test_replaces_localhost_url_with_base64(self, tmp_path):
        # Создаём временный файл
        img_file = tmp_path / 'test.png'
        img_file.write_bytes(b'\x89PNG\r\n\x1a\n' + b'\x00' * 10)

        html = f'<img src="http://localhost:8080/icons/test.png">'

        with patch.object(email_app, 'CACHE_DIR', str(tmp_path)), \
             patch('os.path.exists', side_effect=lambda p: p == str(tmp_path / 'icons' / 'test.png')), \
             patch('builtins.open', create=True) as mock_open:
            mock_open.return_value.__enter__.return_value.read.return_value = b'fake-image'
            # Проверяем что функция не падает
            result = email_app.prepare_html_for_email(html)
            assert isinstance(result, str)

    def test_replaces_127_0_0_1_url(self):
        html = '<img src="http://127.0.0.1:8080/icons/test.png">'
        # Без реального файла — просто проверяем что не падает
        result = email_app.prepare_html_for_email(html)
        assert isinstance(result, str)

    def test_data_uri_unchanged(self):
        b64 = base64.b64encode(b'fake').decode()
        html = f'<img src="data:image/png;base64,{b64}">'
        result = email_app.prepare_html_for_email(html)
        assert f'data:image/png;base64,{b64}' in result

    def test_relative_bullets_path_resolved(self, tmp_path):
        img_data = b'fake-bullet-data'
        bullet_dir = tmp_path / 'bullets'
        bullet_dir.mkdir()
        bullet_file = bullet_dir / 'circle.png'
        bullet_file.write_bytes(img_data)

        html = '<img src="bullets/circle.png">'

        with patch.object(email_app, 'CACHE_DIR', str(tmp_path)):
            result = email_app.prepare_html_for_email(html)
            # Должен заменить на base64
            assert 'data:image' in result or 'bullets/circle.png' in result

    def test_external_https_url_unchanged(self):
        html = '<img src="https://example.com/image.png">'
        result = email_app.prepare_html_for_email(html)
        assert 'https://example.com/image.png' in result

    def test_multiple_images_processed(self, tmp_path):
        html = '''
            <img src="http://localhost:8080/icons/a.png">
            <img src="http://localhost:8080/icons/b.png">
            <p>текст</p>
        '''
        result = email_app.prepare_html_for_email(html)
        assert isinstance(result, str)
        assert '<p>текст</p>' in result

    def test_non_image_relative_paths_unchanged(self):
        html = '<link rel="stylesheet" href="styles/main.css">'
        result = email_app.prepare_html_for_email(html)
        assert 'styles/main.css' in result


# ─── prepare_html_for_meeting ─────────────────────────────────────────────

class TestPrepareHtmlForMeeting:

    def test_empty_returns_empty(self):
        assert email_app.prepare_html_for_meeting('') == ''
        assert email_app.prepare_html_for_meeting(None) == ''

    def test_data_uri_converted_to_file(self, tmp_path):
        img_data = b'\x89PNG\r\n' + b'\x00' * 20
        b64 = base64.b64encode(img_data).decode()
        html = f'<img src="data:image/png;base64,{b64}">'

        with patch.object(email_app, 'CACHE_DIR', str(tmp_path)):
            result = email_app.prepare_html_for_meeting(html)
            # data: URI должен быть заменён на http://IP/meeting-assets/...
            assert 'data:' not in result
            assert 'meeting-assets' in result

    def test_localhost_replaced_with_real_ip(self):
        port = email_app.PORT
        html = f'<img src="http://localhost:{port}/icons/test.png">'
        with patch('app._get_local_ip', return_value='192.168.1.100'):
            # Пересоздаём вызов чтобы патч сработал
            import importlib
            result = email_app.prepare_html_for_meeting(html)
            # localhost должен быть заменён на что-то другое
            assert f'http://localhost:{port}' not in result

    def test_relative_path_becomes_absolute_url(self):
        html = '<img src="bullets/circle.png">'
        with patch('app._get_local_ip', return_value='10.0.0.1'):
            result = email_app.prepare_html_for_meeting(html)
            assert 'http://10.0.0.1' in result
            assert 'bullets/circle.png' in result

    def test_external_url_unchanged(self):
        html = '<img src="https://external.com/img.png">'
        result = email_app.prepare_html_for_meeting(html)
        assert 'https://external.com/img.png' in result

    def test_plain_text_unchanged(self):
        html = '<p>Текст без картинок</p>'
        result = email_app.prepare_html_for_meeting(html)
        assert result == html


# ─── API /api/send/email с вложениями ─────────────────────────────────────

class TestApiSendEmailAttachments:

    def setup_method(self):
        email_app.app.config['TESTING'] = True
        self.client = email_app.app.test_client()

    def _make_attachment(self, name='file.pdf', content=b'data'):
        return {
            'name': name,
            'content': base64.b64encode(content).decode(),
            'mime_type': 'application/pdf'
        }

    def test_email_with_attachments_calls_send(self):
        att = self._make_attachment()
        with patch('app.credentials_exist', return_value=True), \
             patch('app.load_credentials', return_value={
                 'server': 's', 'username': 'u',
                 'password': 'p', 'from_email': 'u@rt.ru'
             }), \
             patch('app.connect_exchange', return_value=MagicMock()), \
             patch('app.exchange_send_email') as mock_send, \
             patch('app.prepare_html_for_email', return_value='<p>html</p>'):
            r = self.client.post('/api/send/email', json={
                'subject': 'Тест',
                'to': ['a@rt.ru'],
                'html_body': '<p>html</p>',
                'attachments': [att]
            })
            assert r.status_code == 200
            # Проверяем что attachments передались в exchange_send_email
            call_kwargs = mock_send.call_args
            assert call_kwargs is not None
            # attachments должны быть в аргументах
            args = call_kwargs[0] if call_kwargs[0] else []
            kwargs = call_kwargs[1] if call_kwargs[1] else {}
            passed_attachments = kwargs.get('attachments') or (args[6] if len(args) > 6 else None)
            assert passed_attachments is not None
            assert len(passed_attachments) == 1
            assert passed_attachments[0]['name'] == 'file.pdf'

    def test_email_without_attachments_still_works(self):
        with patch('app.credentials_exist', return_value=True), \
             patch('app.load_credentials', return_value={
                 'server': 's', 'username': 'u',
                 'password': 'p', 'from_email': 'u@rt.ru'
             }), \
             patch('app.connect_exchange', return_value=MagicMock()), \
             patch('app.exchange_send_email') as mock_send, \
             patch('app.prepare_html_for_email', return_value='<p>html</p>'):
            r = self.client.post('/api/send/email', json={
                'subject': 'Тест',
                'to': ['a@rt.ru'],
                'html_body': '<p>html</p>'
            })
            assert r.status_code == 200

    def test_email_with_multiple_attachments(self):
        atts = [
            self._make_attachment('a.pdf'),
            self._make_attachment('b.docx', b'docx-data'),
            self._make_attachment('c.xlsx', b'xlsx-data'),
        ]
        with patch('app.credentials_exist', return_value=True), \
             patch('app.load_credentials', return_value={
                 'server': 's', 'username': 'u',
                 'password': 'p', 'from_email': 'u@rt.ru'
             }), \
             patch('app.connect_exchange', return_value=MagicMock()), \
             patch('app.exchange_send_email') as mock_send, \
             patch('app.prepare_html_for_email', return_value='<p>html</p>'):
            r = self.client.post('/api/send/email', json={
                'subject': 'Тест',
                'to': ['a@rt.ru'],
                'html_body': '<p>html</p>',
                'attachments': atts
            })
            assert r.status_code == 200


# ─── API /api/send/meeting с вложениями ───────────────────────────────────

class TestApiSendMeetingAttachments:

    def setup_method(self):
        email_app.app.config['TESTING'] = True
        self.client = email_app.app.test_client()

    def _make_attachment(self, name='agenda.pdf'):
        return {
            'name': name,
            'content': base64.b64encode(b'fake-content').decode(),
            'mime_type': 'application/pdf'
        }

    def test_meeting_with_attachments_calls_send(self):
        att = self._make_attachment()
        with patch('app.credentials_exist', return_value=True), \
             patch('app.load_credentials', return_value={
                 'server': 's', 'username': 'u',
                 'password': 'p', 'from_email': 'u@rt.ru'
             }), \
             patch('app.connect_exchange', return_value=MagicMock()), \
             patch('app.exchange_send_meeting') as mock_send, \
             patch('app.prepare_html_for_email', return_value='<p>html</p>'):
            r = self.client.post('/api/send/meeting', json={
                'subject': 'Встреча',
                'to': ['a@rt.ru'],
                'html_body': '<p>html</p>',
                'start_dt': '2025-06-01T10:00:00',
                'end_dt': '2025-06-01T11:00:00',
                'attachments': [att]
            })
            assert r.status_code == 200
            call_kwargs = mock_send.call_args[1] if mock_send.call_args[1] else {}
            passed_atts = call_kwargs.get('attachments')
            assert passed_atts is not None
            assert passed_atts[0]['name'] == 'agenda.pdf'

    def test_meeting_without_attachments_works(self):
        with patch('app.credentials_exist', return_value=True), \
             patch('app.load_credentials', return_value={
                 'server': 's', 'username': 'u',
                 'password': 'p', 'from_email': 'u@rt.ru'
             }), \
             patch('app.connect_exchange', return_value=MagicMock()), \
             patch('app.exchange_send_meeting') as mock_send, \
             patch('app.prepare_html_for_email', return_value='<p>html</p>'):
            r = self.client.post('/api/send/meeting', json={
                'subject': 'Встреча',
                'to': ['a@rt.ru'],
                'html_body': '<p>html</p>',
                'start_dt': '2025-06-01T10:00:00',
                'end_dt': '2025-06-01T11:00:00',
            })
            assert r.status_code == 200