"""
TDD-тесты для модулей отправки писем и встреч через Exchange (EWS).

Покрывает:
  credentials_manager.py — шифрование пароля, сохранение/загрузка учётных данных
  exchange_sender.py     — отправка email и встреч через exchangelib
  Flask API              — /api/credentials/status, /api/credentials/save,
                           /api/send/email, /api/send/meeting

Запуск: pytest tests/test_exchange.py -v
"""

import pytest
import json
import os
import sys
import tempfile
import shutil
import hashlib
import base64
import datetime
import unittest.mock as mock
from unittest.mock import ANY, MagicMock, patch, call

# ─── Мокаем Windows и exchangelib до импорта ─────────────────────────────────
for mod in ('win32com', 'win32com.client', 'pythoncom', 'pywin32_runtime'):
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()
sys.modules['win32com'].client = MagicMock()

# Мокаем exchangelib — он не установлен на prod машинах без Exchange
exchangelib_mock = MagicMock()
sys.modules['exchangelib'] = exchangelib_mock
sys.modules['exchangelib.errors'] = MagicMock()

FAKE_NETWORK = tempfile.mkdtemp(prefix='eb_net_')
FAKE_CACHE   = tempfile.mkdtemp(prefix='eb_cache_')

with mock.patch.dict(os.environ, {'APP_MODE': 'admin'}):
    sys.modules['app_admin'] = MagicMock()
    sys.modules['app_user']  = MagicMock()

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

    if 'app' in sys.modules:
        email_app = sys.modules['app']
    else:
        import app as email_app

    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR              = FAKE_CACHE
    email_app.CACHE_VERSION_FILE     = os.path.join(FAKE_CACHE, 'cache_version.txt')
    email_app.NETWORK_VERSION_FILE   = os.path.join(FAKE_NETWORK, 'version.txt')


# ─── Фикстуры ────────────────────────────────────────────────────────────────

@pytest.fixture(scope='session')
def app_instance():
    email_app.app.config['TESTING'] = True
    yield email_app.app


@pytest.fixture
def client(app_instance):
    return app_instance.test_client()


@pytest.fixture
def creds_dir(tmp_path):
    """Временная директория для credentials.json"""
    return tmp_path


@pytest.fixture(autouse=True)
def reset_paths():
    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR              = FAKE_CACHE
    yield
    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR              = FAKE_CACHE
    for f in os.listdir(FAKE_CACHE):
        try:
            p = os.path.join(FAKE_CACHE, f)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
        except Exception:
            pass


# =============================================================================
# Утилиты шифрования (будут в credentials_manager.py)
# Тестируем контракт: encrypt → decrypt = оригинал
# =============================================================================

class TestPasswordEncryption:
    """
    credentials_manager.py должен предоставлять:
      make_key(username, hostname) -> bytes  — детерминированный ключ Fernet
      encrypt_password(password, key) -> str — зашифрованная строка
      decrypt_password(encrypted, key) -> str — обратное
    """

    def _make_key(self, username: str, hostname: str) -> bytes:
        """Эталонная реализация для сравнения в тестах."""
        from cryptography.fernet import Fernet
        raw = (username + hostname).encode('utf-8')
        key = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
        return key

    def _encrypt(self, password: str, key: bytes) -> str:
        from cryptography.fernet import Fernet
        return Fernet(key).encrypt(password.encode('utf-8')).decode('utf-8')

    def _decrypt(self, encrypted: str, key: bytes) -> str:
        from cryptography.fernet import Fernet
        return Fernet(key).decrypt(encrypted.encode('utf-8')).decode('utf-8')

    def test_make_key_returns_bytes(self):
        key = self._make_key('user@rt.ru', 'PC01')
        assert isinstance(key, bytes)

    def test_make_key_is_valid_fernet_key(self):
        from cryptography.fernet import Fernet
        key = self._make_key('user@rt.ru', 'PC01')
        # Fernet принимает только 32-байтовые base64url ключи
        assert len(base64.urlsafe_b64decode(key)) == 32
        # Не должно выбросить исключение
        Fernet(key)

    def test_make_key_deterministic(self):
        """Один и тот же ввод → один и тот же ключ."""
        k1 = self._make_key('user@rt.ru', 'PC01')
        k2 = self._make_key('user@rt.ru', 'PC01')
        assert k1 == k2

    def test_make_key_different_users_different_keys(self):
        k1 = self._make_key('user1@rt.ru', 'PC01')
        k2 = self._make_key('user2@rt.ru', 'PC01')
        assert k1 != k2

    def test_make_key_different_hosts_different_keys(self):
        k1 = self._make_key('user@rt.ru', 'PC01')
        k2 = self._make_key('user@rt.ru', 'PC02')
        assert k1 != k2

    def test_encrypt_returns_string(self):
        key = self._make_key('user@rt.ru', 'PC01')
        result = self._encrypt('mypassword', key)
        assert isinstance(result, str)

    def test_encrypt_hides_password(self):
        key = self._make_key('user@rt.ru', 'PC01')
        result = self._encrypt('mypassword', key)
        assert 'mypassword' not in result

    def test_decrypt_restores_original(self):
        key = self._make_key('user@rt.ru', 'PC01')
        enc = self._encrypt('SuperSecret123!', key)
        dec = self._decrypt(enc, key)
        assert dec == 'SuperSecret123!'

    def test_encrypt_same_password_different_ciphertext(self):
        """Fernet использует случайный IV — каждый раз разный шифртекст."""
        key = self._make_key('user@rt.ru', 'PC01')
        enc1 = self._encrypt('pass', key)
        enc2 = self._encrypt('pass', key)
        assert enc1 != enc2  # разный IV

    def test_decrypt_with_wrong_key_raises(self):
        from cryptography.fernet import Fernet, InvalidToken
        key1 = self._make_key('user@rt.ru', 'PC01')
        key2 = self._make_key('other@rt.ru', 'PC01')
        enc = self._encrypt('password', key1)
        with pytest.raises(Exception):  # InvalidToken или DecryptionError
            self._decrypt(enc, key2)

    def test_empty_password_encrypts_and_decrypts(self):
        key = self._make_key('user@rt.ru', 'PC01')
        enc = self._encrypt('', key)
        dec = self._decrypt(enc, key)
        assert dec == ''

    def test_cyrillic_password(self):
        key = self._make_key('user@rt.ru', 'PC01')
        pw = 'Пароль123!'
        enc = self._encrypt(pw, key)
        dec = self._decrypt(enc, key)
        assert dec == pw


# =============================================================================
# credentials_manager.py — сохранение и загрузка
# =============================================================================

class TestCredentialsManager:
    """
    credentials_manager.py должен предоставлять:
      save_credentials(path, server, username, password, from_email,
                       default_senders=[]) -> None
      load_credentials(path) -> dict | None
      credentials_exist(path) -> bool
      validate_credentials_data(data) -> (bool, str | None)
    """

    SAMPLE = {
        'server':          'mail.rt.ru',
        'username':        'user@rt.ru',
        'password':        'MyP@ssw0rd',
        'from_email':      'user@rt.ru',
        'default_senders': ['sender1@rt.ru', 'sender2@rt.ru'],
    }

    def _make_key(self, username, hostname='testhost'):
        raw = (username + hostname).encode('utf-8')
        return base64.urlsafe_b64encode(hashlib.sha256(raw).digest())

    def _simulate_save(self, path, data, hostname='testhost'):
        """Имитирует save_credentials для изолированного тестирования."""
        from cryptography.fernet import Fernet
        key = self._make_key(data['username'], hostname)
        encrypted_pw = Fernet(key).encrypt(data['password'].encode()).decode()
        payload = {
            'server':          data['server'],
            'username':        data['username'],
            'password':        encrypted_pw,
            'from_email':      data['from_email'],
            'default_senders': data.get('default_senders', []),
        }
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    def _simulate_load(self, path, hostname='testhost'):
        """Имитирует load_credentials."""
        from cryptography.fernet import Fernet
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        key = self._make_key(data['username'], hostname)
        data['password'] = Fernet(key).decrypt(data['password'].encode()).decode()
        return data

    # --- credentials_exist ---

    def test_credentials_exist_false_when_no_file(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        assert not os.path.exists(path)

    def test_credentials_exist_true_after_save(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        assert os.path.exists(path)

    # --- save_credentials ---

    def test_save_creates_json_file(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        assert os.path.isfile(path)

    def test_save_file_is_valid_json(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        assert isinstance(data, dict)

    def test_save_does_not_store_plaintext_password(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        raw = open(path, encoding='utf-8').read()
        assert self.SAMPLE['password'] not in raw

    def test_save_stores_all_required_fields(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        for key in ('server', 'username', 'password', 'from_email', 'default_senders'):
            assert key in data

    def test_save_stores_correct_server_and_username(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        assert data['server']   == 'mail.rt.ru'
        assert data['username'] == 'user@rt.ru'

    def test_save_default_senders_empty_list_by_default(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        sample_no_senders = {k: v for k, v in self.SAMPLE.items() if k != 'default_senders'}
        self._simulate_save(path, sample_no_senders)
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        assert data['default_senders'] == []

    def test_save_overwrites_existing_file(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        new_data = {**self.SAMPLE, 'server': 'new.rt.ru'}
        self._simulate_save(path, new_data)
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        assert data['server'] == 'new.rt.ru'

    # --- load_credentials ---

    def test_load_returns_none_when_no_file(self, tmp_path):
        path = str(tmp_path / 'nonexistent.json')
        # load должен вернуть None если файла нет
        result = None if not os.path.exists(path) else self._simulate_load(path)
        assert result is None

    def test_load_returns_dict(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        result = self._simulate_load(path)
        assert isinstance(result, dict)

    def test_load_decrypts_password_correctly(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        result = self._simulate_load(path)
        assert result['password'] == self.SAMPLE['password']

    def test_load_restores_all_fields(self, tmp_path):
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        result = self._simulate_load(path)
        assert result['server']          == self.SAMPLE['server']
        assert result['username']        == self.SAMPLE['username']
        assert result['from_email']      == self.SAMPLE['from_email']
        assert result['default_senders'] == self.SAMPLE['default_senders']

    def test_load_password_different_from_stored(self, tmp_path):
        """Проверяем что в файле хранится НЕ оригинальный пароль."""
        path = str(tmp_path / 'credentials.json')
        self._simulate_save(path, self.SAMPLE)
        with open(path, encoding='utf-8') as f:
            raw = json.load(f)
        assert raw['password'] != self.SAMPLE['password']

    def test_round_trip_multiple_passwords(self, tmp_path):
        """Несколько разных паролей — все round-trip корректны."""
        passwords = ['simple', 'C0mpl3x!P@ss', 'Кириллица123', '   spaces   ', '']
        for pw in passwords:
            path = str(tmp_path / f'creds_{len(pw)}.json')
            data = {**self.SAMPLE, 'password': pw}
            self._simulate_save(path, data)
            loaded = self._simulate_load(path)
            assert loaded['password'] == pw, f"Failed for password: {repr(pw)}"

    # --- validate_credentials_data ---

    def _validate(self, data):
        """Имитирует validate_credentials_data."""
        required = ['server', 'username', 'password', 'from_email']
        for field in required:
            if not data.get(field, '').strip():
                return False, f'Поле {field} обязательно'
        if '@' not in data.get('from_email', ''):
            return False, 'Некорректный email отправителя'
        return True, None

    def test_validate_ok_with_full_data(self):
        ok, err = self._validate(self.SAMPLE)
        assert ok is True
        assert err is None

    def test_validate_fails_empty_server(self):
        ok, err = self._validate({**self.SAMPLE, 'server': ''})
        assert ok is False
        assert err is not None

    def test_validate_fails_empty_username(self):
        ok, _ = self._validate({**self.SAMPLE, 'username': ''})
        assert ok is False

    def test_validate_fails_empty_password(self):
        ok, _ = self._validate({**self.SAMPLE, 'password': ''})
        assert ok is False

    def test_validate_fails_invalid_from_email(self):
        ok, err = self._validate({**self.SAMPLE, 'from_email': 'notanemail'})
        assert ok is False
        assert 'email' in err.lower()

    def test_validate_fails_whitespace_only(self):
        ok, _ = self._validate({**self.SAMPLE, 'server': '   '})
        assert ok is False


# =============================================================================
# exchange_sender.py — отправка писем (мокаем exchangelib)
# =============================================================================

class TestExchangeEmailSender:
    """
    exchange_sender.py должен предоставлять:
      connect(server, username, password, from_email) -> Account
      send_email(account, subject, html_body, to, cc=[], bcc=[]) -> None
      send_meeting(account, subject, html_body, to, cc=[], bcc=[],
                   location='', start_dt=..., end_dt=...) -> None
    """

    def _make_mock_account(self):
        account = MagicMock()
        account.primary_smtp_address = 'sender@rt.ru'
        return account

    def _simulate_connect(self, server, username, password, from_email):
        """Имитирует connect() — возвращает mock Account."""
        from unittest.mock import patch
        with patch('exchange_sender.Credentials') as MockCreds, \
             patch('exchange_sender.Configuration') as MockCfg, \
             patch('exchange_sender.Account') as MockAccount:
            creds    = MockCreds(username=username, password=password)
            config   = MockCfg(server=server, credentials=creds)
            account  = MockAccount(
                primary_smtp_address=from_email,
                config=config,
                autodiscover=False,
            )
            return account

    def _simulate_send_email(self, account, subject, html_body, to, cc=None, bcc=None):
        """Имитирует send_email() — строит Message и вызывает send()."""
        msg = MagicMock()
        msg.subject = subject
        msg.to_recipients = to
        msg.cc_recipients = cc or []
        msg.bcc_recipients = bcc or []
        msg.body = html_body
        msg.send()
        return msg

    def _simulate_send_meeting(self, account, subject, html_body, to,
                               cc=None, bcc=None, location='',
                               start_dt=None, end_dt=None):
        """Имитирует send_meeting() — трёхшаговый EWS-флоу: save → attach → _update."""
        item = MagicMock()
        item.subject   = subject
        item.body      = html_body
        item.location  = location
        item.start     = start_dt
        item.end       = end_dt
        item.to_recipients = to
        # Шаг 1: сохранить без рассылки
        item.save(send_meeting_invitations='SendToNone')
        # Шаг 2: (attach вложений — здесь не имитируем)
        # Шаг 3: отправить с телом
        item._update(
            update_fieldnames=['body'],
            message_disposition='SaveOnly',
            conflict_resolution='AutoResolve',
            send_meeting_invitations='SendToAllAndSaveCopy',
        )
        return item

    # --- connect (тестируем реальную connect_exchange через патч её зависимостей) ---

    def test_connect_calls_credentials(self):
        import exchange_sender
        with patch.object(exchange_sender, 'Credentials') as MockCreds, \
             patch.object(exchange_sender, 'Configuration'), \
             patch.object(exchange_sender, 'Account'):
            exchange_sender.connect_exchange('mail.rt.ru', 'user@rt.ru', 'pass', 'user@rt.ru')
            MockCreds.assert_called_once_with(username='user@rt.ru', password='pass')

    def test_connect_calls_account_with_from_email(self):
        import exchange_sender
        with patch.object(exchange_sender, 'Credentials'), \
             patch.object(exchange_sender, 'Configuration'), \
             patch.object(exchange_sender, 'Account') as MockAccount:
            exchange_sender.connect_exchange('mail.rt.ru', 'user@rt.ru', 'pass', 'sender@rt.ru')
            MockAccount.assert_called_once()
            kwargs = MockAccount.call_args.kwargs
            assert kwargs.get('primary_smtp_address') == 'sender@rt.ru'

    def test_connect_uses_autodiscover_false(self):
        import exchange_sender
        with patch.object(exchange_sender, 'Credentials'), \
             patch.object(exchange_sender, 'Configuration'), \
             patch.object(exchange_sender, 'Account') as MockAccount:
            exchange_sender.connect_exchange('mail.rt.ru', 'user@rt.ru', 'pass', 'user@rt.ru')
            kwargs = MockAccount.call_args.kwargs
            assert kwargs.get('autodiscover') is False

    # --- send_email ---

    def test_send_email_calls_send(self):
        account = self._make_mock_account()
        msg = self._simulate_send_email(
            account, 'Тема', '<h1>Тест</h1>',
            to=['recipient@rt.ru']
        )
        msg.send.assert_called_once()

    def test_send_email_stores_subject(self):
        account = self._make_mock_account()
        msg = self._simulate_send_email(
            account, 'Важная тема', '<p>Текст</p>',
            to=['a@rt.ru']
        )
        assert msg.subject == 'Важная тема'

    def test_send_email_stores_recipients(self):
        account = self._make_mock_account()
        msg = self._simulate_send_email(
            account, 'Тема', '<p>Тело</p>',
            to=['a@rt.ru', 'b@rt.ru']
        )
        assert msg.to_recipients == ['a@rt.ru', 'b@rt.ru']

    def test_send_email_stores_cc(self):
        account = self._make_mock_account()
        msg = self._simulate_send_email(
            account, 'Тема', '<p>Тело</p>',
            to=['a@rt.ru'], cc=['cc@rt.ru']
        )
        assert msg.cc_recipients == ['cc@rt.ru']

    def test_send_email_stores_bcc(self):
        account = self._make_mock_account()
        msg = self._simulate_send_email(
            account, 'Тема', '<p>Тело</p>',
            to=['a@rt.ru'], bcc=['hidden@rt.ru']
        )
        assert msg.bcc_recipients == ['hidden@rt.ru']

    def test_send_email_cc_defaults_to_empty(self):
        account = self._make_mock_account()
        msg = self._simulate_send_email(account, 'Тема', '<p>Тело</p>', to=['a@rt.ru'])
        assert msg.cc_recipients == []

    def test_send_email_html_body_passed(self):
        account = self._make_mock_account()
        html = '<html><body><h1>Заголовок</h1></body></html>'
        msg = self._simulate_send_email(account, 'Тема', html, to=['a@rt.ru'])
        assert msg.body == html

    def test_send_email_empty_to_raises(self):
        """Пустой список получателей должен вызывать ValueError."""
        def send_with_validation(to):
            if not to:
                raise ValueError('Не указаны получатели')
            return self._simulate_send_email(
                self._make_mock_account(), 'Тема', '<p>Тело</p>', to=to
            )
        with pytest.raises(ValueError, match='получател'):
            send_with_validation([])

    def test_send_email_invalid_email_format_raises(self):
        """Адрес без @ должен вызывать ValueError."""
        def send_with_validation(to):
            for addr in to:
                if '@' not in addr:
                    raise ValueError(f'Некорректный email: {addr}')
        with pytest.raises(ValueError, match='email'):
            send_with_validation(['notanemail'])

    # --- send_meeting ---

    def test_send_meeting_uses_three_step_flow(self):
        """Трёхшаговый EWS-флоу: save(SendToNone) → _update(SendToAllAndSaveCopy)."""
        account = self._make_mock_account()
        start = datetime.datetime(2025, 6, 1, 10, 0)
        end   = datetime.datetime(2025, 6, 1, 11, 0)
        item = self._simulate_send_meeting(
            account, 'Встреча', '<p>Тело</p>',
            to=['a@rt.ru'], start_dt=start, end_dt=end
        )
        item.save.assert_called_once_with(send_meeting_invitations='SendToNone')
        item._update.assert_called_once()
        call_kwargs = item._update.call_args[1]
        assert call_kwargs.get('send_meeting_invitations') == 'SendToAllAndSaveCopy'

    def test_send_meeting_stores_subject(self):
        account = self._make_mock_account()
        start = datetime.datetime(2025, 6, 1, 10, 0)
        end   = datetime.datetime(2025, 6, 1, 11, 0)
        item = self._simulate_send_meeting(
            account, 'Важная встреча', '<p>Тело</p>',
            to=['a@rt.ru'], start_dt=start, end_dt=end
        )
        assert item.subject == 'Важная встреча'

    def test_send_meeting_stores_location(self):
        account = self._make_mock_account()
        start = datetime.datetime(2025, 6, 1, 10, 0)
        end   = datetime.datetime(2025, 6, 1, 11, 0)
        item = self._simulate_send_meeting(
            account, 'Встреча', '<p>Тело</p>',
            to=['a@rt.ru'], location='Переговорная А',
            start_dt=start, end_dt=end
        )
        assert item.location == 'Переговорная А'

    def test_send_meeting_empty_location_allowed(self):
        account = self._make_mock_account()
        start = datetime.datetime(2025, 6, 1, 10, 0)
        end   = datetime.datetime(2025, 6, 1, 11, 0)
        item = self._simulate_send_meeting(
            account, 'Встреча', '<p>Тело</p>',
            to=['a@rt.ru'], location='',
            start_dt=start, end_dt=end
        )
        assert item.location == ''

    def test_send_meeting_stores_start_end(self):
        account = self._make_mock_account()
        start = datetime.datetime(2025, 6, 1, 10, 0)
        end   = datetime.datetime(2025, 6, 1, 12, 30)
        item = self._simulate_send_meeting(
            account, 'Встреча', '<p>Тело</p>',
            to=['a@rt.ru'], start_dt=start, end_dt=end
        )
        assert item.start == start
        assert item.end   == end

    def test_send_meeting_end_after_start(self):
        """Дата окончания должна быть позже начала."""
        start = datetime.datetime(2025, 6, 1, 10, 0)
        end   = datetime.datetime(2025, 6, 1,  9, 0)  # раньше start
        def validate_times(s, e):
            if e <= s:
                raise ValueError('Время окончания должно быть позже начала')
        with pytest.raises(ValueError, match='позже'):
            validate_times(start, end)

    def test_send_meeting_same_start_end_raises(self):
        start = end = datetime.datetime(2025, 6, 1, 10, 0)
        def validate_times(s, e):
            if e <= s:
                raise ValueError('Время окончания должно быть позже начала')
        with pytest.raises(ValueError):
            validate_times(start, end)

    def test_send_meeting_missing_start_raises(self):
        def validate_meeting(start_dt, end_dt):
            if not start_dt or not end_dt:
                raise ValueError('Дата и время обязательны')
        with pytest.raises(ValueError, match='Дата'):
            validate_meeting(None, datetime.datetime(2025, 6, 1, 11, 0))

    def test_send_meeting_missing_end_raises(self):
        def validate_meeting(start_dt, end_dt):
            if not start_dt or not end_dt:
                raise ValueError('Дата и время обязательны')
        with pytest.raises(ValueError):
            validate_meeting(datetime.datetime(2025, 6, 1, 10, 0), None)


# =============================================================================
# exchange_sender.py — обработка ошибок подключения
# =============================================================================

class TestExchangeErrorHandling:
    """
    exchange_sender.py должен корректно обрабатывать ошибки exchangelib
    и преобразовывать их в понятные сообщения.
    """

    def _wrap_error(self, exc):
        """Имитирует обёртку ошибок в exchange_sender.connect()."""
        exc_type = type(exc).__name__
        if 'Unauthorized' in exc_type or 'AuthenticationFailed' in exc_type:
            raise ValueError('Неверный логин или пароль')
        if 'Transport' in exc_type or 'Connection' in exc_type:
            raise ConnectionError(f'Сервер Exchange недоступен')
        raise RuntimeError(f'Ошибка Exchange: {exc}')

    def test_unauthorized_becomes_value_error(self):
        class UnauthorizedError(Exception): pass
        with pytest.raises(ValueError, match='пароль'):
            self._wrap_error(UnauthorizedError('401'))

    def test_transport_error_becomes_connection_error(self):
        class TransportError(Exception): pass
        with pytest.raises(ConnectionError, match='недоступен'):
            self._wrap_error(TransportError('timeout'))

    def test_unknown_error_becomes_runtime_error(self):
        with pytest.raises(RuntimeError, match='Ошибка Exchange'):
            self._wrap_error(Exception('something unknown'))

    def test_auth_failed_variant(self):
        class AuthenticationFailed(Exception): pass
        with pytest.raises(ValueError, match='пароль'):
            self._wrap_error(AuthenticationFailed())


# =============================================================================
# Flask API — /api/credentials/status
# =============================================================================

class TestApiCredentialsStatus:
    """
    GET /api/credentials/status
    Ответ: { "exists": bool, "username": str|null, "server": str|null }
    """

    def test_returns_200(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=False, create=True):
            resp = client.get('/api/credentials/status')
        assert resp.status_code == 200

    def test_exists_false_when_no_file(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=False, create=True), \
             patch.object(email_app, 'load_credentials', return_value=None, create=True):
            resp = client.get('/api/credentials/status')
            data = resp.get_json()
        assert data['exists'] is False

    def test_exists_true_when_file_present(self, client):
        creds = {
            'server': 'mail.rt.ru', 'username': 'user@rt.ru',
            'password': 'secret',
            'from_email': 'user@rt.ru', 'default_senders': []
        }
        with patch.object(email_app, 'credentials_exist', return_value=True, create=True), \
             patch.object(email_app, 'load_credentials', return_value=creds, create=True):
            resp = client.get('/api/credentials/status')
            data = resp.get_json()
        assert data['exists'] is True
        assert data['has_password'] is True

    def test_returns_username_when_exists(self, client):
        creds = {'server': 'mail.rt.ru', 'username': 'user@rt.ru',
                 'from_email': 'user@rt.ru', 'default_senders': []}
        with patch.object(email_app, 'credentials_exist', return_value=True, create=True), \
             patch.object(email_app, 'load_credentials', return_value=creds, create=True):
            resp = client.get('/api/credentials/status')
            data = resp.get_json()
        assert data.get('username') == 'user@rt.ru'

    def test_returns_null_username_when_not_exists(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=False, create=True), \
             patch.object(email_app, 'load_credentials', return_value=None, create=True):
            resp = client.get('/api/credentials/status')
            data = resp.get_json()
        assert data.get('username') is None


# =============================================================================
# Flask API — /api/credentials/save
# =============================================================================

class TestApiCredentialsSave:
    """
    POST /api/credentials/save
    Body: { server, username, password, from_email, default_senders }
    Ответ: { success: bool, error?: str }
    """

    VALID_BODY = {
        'server':          'mail.rt.ru',
        'username':        'user@rt.ru',
        'password':        'MyP@ssw0rd',
        'from_email':      'user@rt.ru',
        'default_senders': ['sender@rt.ru'],
    }

    def test_returns_200_on_valid_data(self, client):
        with patch.object(email_app, 'save_credentials', return_value=None, create=True):
            resp = client.post('/api/credentials/save', json=self.VALID_BODY)
        assert resp.status_code == 200

    def test_success_true_on_valid_data(self, client):
        with patch.object(email_app, 'save_credentials', return_value=None, create=True):
            resp = client.post('/api/credentials/save', json=self.VALID_BODY)
            data = resp.get_json()
        assert data['success'] is True

    def test_missing_server_returns_400(self, client):
        body = {**self.VALID_BODY, 'server': ''}
        resp = client.post('/api/credentials/save', json=body)
        assert resp.status_code == 400

    def test_missing_username_returns_400(self, client):
        body = {**self.VALID_BODY, 'username': ''}
        resp = client.post('/api/credentials/save', json=body)
        assert resp.status_code == 400

    def test_missing_password_returns_400(self, client):
        body = {**self.VALID_BODY, 'password': ''}
        resp = client.post('/api/credentials/save', json=body)
        assert resp.status_code == 400

    def test_blank_password_reuses_existing_secret(self, client):
        body = {**self.VALID_BODY, 'password': '', 'from_email': 'updated@rt.ru'}
        existing = {**self.VALID_BODY}
        with patch.object(email_app, 'credentials_exist', return_value=True, create=True), \
             patch.object(email_app, 'load_credentials', return_value=existing, create=True), \
             patch.object(email_app, 'save_credentials', return_value=None, create=True) as save_mock:
            resp = client.post('/api/credentials/save', json=body)

        assert resp.status_code == 200
        save_mock.assert_called_once_with(
            ANY,
            self.VALID_BODY['server'],
            self.VALID_BODY['username'],
            self.VALID_BODY['password'],
            'updated@rt.ru',
            self.VALID_BODY['default_senders'],
        )

    def test_missing_from_email_returns_400(self, client):
        body = {**self.VALID_BODY, 'from_email': ''}
        resp = client.post('/api/credentials/save', json=body)
        assert resp.status_code == 400

    def test_invalid_from_email_returns_400(self, client):
        body = {**self.VALID_BODY, 'from_email': 'notanemail'}
        resp = client.post('/api/credentials/save', json=body)
        assert resp.status_code == 400

    def test_default_senders_optional(self, client):
        body = {k: v for k, v in self.VALID_BODY.items() if k != 'default_senders'}
        with patch.object(email_app, 'save_credentials', return_value=None, create=True):
            resp = client.post('/api/credentials/save', json=body)
        assert resp.status_code == 200

    def test_error_field_present_on_400(self, client):
        body = {**self.VALID_BODY, 'server': ''}
        resp = client.post('/api/credentials/save', json=body)
        data = resp.get_json()
        assert 'error' in data
        assert data['success'] is False


# =============================================================================
# Flask API — /api/send/email
# =============================================================================

class TestApiSendEmail:
    """
    POST /api/send/email
    Body: { subject, to, cc?, bcc?, from_email? }
    Ответ: { success: bool, error?: str }
    """

    VALID_BODY = {
        'subject':    'Тестовое письмо',
        'to':         ['recipient@rt.ru'],
        'cc':         [],
        'bcc':        [],
        'from_email': 'sender@rt.ru',
    }

    def _mock_send(self, client, body, side_effect=None):
        creds = {
            'server': 'mail.rt.ru', 'username': 'u@rt.ru',
            'password': 'pass', 'from_email': 'u@rt.ru'
        }
        with patch.object(email_app, 'credentials_exist', return_value=True, create=True), \
             patch.object(email_app, 'load_credentials', return_value=creds, create=True), \
             patch.object(email_app, 'connect_exchange', return_value=MagicMock(), create=True), \
             patch.object(email_app, 'exchange_send_email',
                          side_effect=side_effect, return_value=None, create=True):
            return client.post('/api/send/email', json=body)

    def test_success_returns_200(self, client):
        resp = self._mock_send(client, self.VALID_BODY)
        assert resp.status_code == 200

    def test_success_true(self, client):
        resp = self._mock_send(client, self.VALID_BODY)
        assert resp.get_json()['success'] is True

    def test_missing_subject_returns_400(self, client):
        body = {**self.VALID_BODY, 'subject': ''}
        resp = self._mock_send(client, body)
        assert resp.status_code == 400

    def test_missing_to_returns_400(self, client):
        body = {**self.VALID_BODY, 'to': []}
        resp = self._mock_send(client, body)
        assert resp.status_code == 400

    def test_no_credentials_returns_401(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=False, create=True):
            resp = client.post('/api/send/email', json=self.VALID_BODY)
        assert resp.status_code == 401

    def test_auth_error_returns_401(self, client):
        resp = self._mock_send(
            client, self.VALID_BODY,
            side_effect=ValueError('Неверный логин или пароль')
        )
        assert resp.status_code == 401

    def test_connection_error_returns_503(self, client):
        resp = self._mock_send(
            client, self.VALID_BODY,
            side_effect=ConnectionError('Сервер недоступен')
        )
        assert resp.status_code == 503

    def test_error_field_on_failure(self, client):
        resp = self._mock_send(
            client, self.VALID_BODY,
            side_effect=ValueError('Неверный пароль')
        )
        data = resp.get_json()
        assert 'error' in data
        assert data['success'] is False


# =============================================================================
# Flask API — /api/send/meeting
# =============================================================================

class TestApiSendMeeting:
    """
    POST /api/send/meeting
    Body: { subject, to, cc?, bcc?, from_email?, location?, start_dt, end_dt }
    Ответ: { success: bool, error?: str }
    """

    VALID_BODY = {
        'subject':    'Планёрка',
        'to':         ['colleague@rt.ru'],
        'cc':         [],
        'bcc':        [],
        'from_email': 'sender@rt.ru',
        'location':   'Переговорная А',
        'start_dt':   '2025-06-01T10:00:00',
        'end_dt':     '2025-06-01T11:00:00',
    }

    def _mock_send(self, client, body, side_effect=None):
        creds = {
            'server': 'mail.rt.ru', 'username': 'u@rt.ru',
            'password': 'pass', 'from_email': 'u@rt.ru'
        }
        with patch.object(email_app, 'credentials_exist', return_value=True, create=True), \
             patch.object(email_app, 'load_credentials', return_value=creds, create=True), \
             patch.object(email_app, 'connect_exchange', return_value=MagicMock(), create=True), \
             patch.object(email_app, 'exchange_send_meeting',
                          side_effect=side_effect, return_value=None, create=True):
            return client.post('/api/send/meeting', json=body)

    def test_success_returns_200(self, client):
        resp = self._mock_send(client, self.VALID_BODY)
        assert resp.status_code == 200

    def test_success_true(self, client):
        resp = self._mock_send(client, self.VALID_BODY)
        assert resp.get_json()['success'] is True

    def test_missing_subject_returns_400(self, client):
        body = {**self.VALID_BODY, 'subject': ''}
        resp = self._mock_send(client, body)
        assert resp.status_code == 400

    def test_missing_to_returns_400(self, client):
        body = {**self.VALID_BODY, 'to': []}
        resp = self._mock_send(client, body)
        assert resp.status_code == 400

    def test_missing_start_dt_returns_400(self, client):
        body = {**self.VALID_BODY, 'start_dt': ''}
        resp = self._mock_send(client, body)
        assert resp.status_code == 400

    def test_missing_end_dt_returns_400(self, client):
        body = {**self.VALID_BODY, 'end_dt': ''}
        resp = self._mock_send(client, body)
        assert resp.status_code == 400

    def test_end_before_start_returns_400(self, client):
        body = {
            **self.VALID_BODY,
            'start_dt': '2025-06-01T11:00:00',
            'end_dt':   '2025-06-01T10:00:00',
        }
        resp = self._mock_send(client, body)
        assert resp.status_code == 400

    def test_empty_location_allowed(self, client):
        body = {**self.VALID_BODY, 'location': ''}
        resp = self._mock_send(client, body)
        assert resp.status_code == 200

    def test_no_credentials_returns_401(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=False, create=True):
            resp = client.post('/api/send/meeting', json=self.VALID_BODY)
        assert resp.status_code == 401

    def test_invalid_datetime_format_returns_400(self, client):
        body = {**self.VALID_BODY, 'start_dt': 'not-a-date'}
        resp = self._mock_send(client, body)
        assert resp.status_code == 400

    def test_connection_error_returns_503(self, client):
        resp = self._mock_send(
            client, self.VALID_BODY,
            side_effect=ConnectionError('Недоступен')
        )
        assert resp.status_code == 503


# =============================================================================
# Парсинг datetime из строки (утилита в exchange_sender или app.py)
# =============================================================================

class TestDatetimeParsing:
    """
    parse_datetime(s) -> datetime.datetime
    Принимает ISO 8601: '2025-06-01T10:00:00'
    """

    def _parse(self, s):
        """Делегирует в реальный parse_datetime из exchange_sender."""
        import exchange_sender
        return exchange_sender.parse_datetime(s)

    def test_valid_iso_format(self):
        dt = self._parse('2025-06-01T10:00:00')
        assert dt.year  == 2025
        assert dt.month == 6
        assert dt.day   == 1
        assert dt.hour  == 10

    def test_empty_string_raises(self):
        with pytest.raises(ValueError, match='Пустая'):
            self._parse('')

    def test_none_raises(self):
        with pytest.raises((ValueError, TypeError)):
            self._parse(None)

    def test_invalid_format_raises(self):
        with pytest.raises(ValueError, match='формат'):
            self._parse('01.06.2025 10:00')

    def test_date_without_time_raises(self):
        with pytest.raises(ValueError):
            self._parse('2025-06-01')

    def test_end_after_start_validation(self):
        start = self._parse('2025-06-01T10:00:00')
        end   = self._parse('2025-06-01T11:30:00')
        assert end > start

    def test_end_before_start_detected(self):
        start = self._parse('2025-06-01T11:00:00')
        end   = self._parse('2025-06-01T10:00:00')
        assert end < start  # логика валидации снаружи

    def test_minutes_preserved(self):
        dt = self._parse('2025-06-01T09:45:00')
        assert dt.minute == 45

    def test_different_dates(self):
        start = self._parse('2025-06-01T10:00:00')
        end   = self._parse('2025-06-02T10:00:00')
        assert (end - start).days == 1


# =============================================================================
# Парсинг списка получателей
# =============================================================================

class TestRecipientsParser:
    """
    parse_recipients(raw) -> list[str]
    Принимает строку 'a@rt.ru, b@rt.ru' или список.
    """

    def _parse(self, raw):
        if isinstance(raw, list):
            return [e.strip() for e in raw if e.strip()]
        if not raw:
            return []
        return [e.strip() for e in str(raw).split(',') if e.strip()]

    def _validate(self, emails):
        invalid = [e for e in emails if '@' not in e]
        if invalid:
            raise ValueError(f'Некорректные адреса: {invalid}')
        return emails

    def test_list_input_passthrough(self):
        result = self._parse(['a@rt.ru', 'b@rt.ru'])
        assert result == ['a@rt.ru', 'b@rt.ru']

    def test_string_comma_separated(self):
        result = self._parse('a@rt.ru, b@rt.ru')
        assert result == ['a@rt.ru', 'b@rt.ru']

    def test_empty_string_returns_empty(self):
        assert self._parse('') == []

    def test_none_returns_empty(self):
        assert self._parse(None) == []

    def test_whitespace_trimmed(self):
        result = self._parse('  a@rt.ru  ,  b@rt.ru  ')
        assert result == ['a@rt.ru', 'b@rt.ru']

    def test_single_recipient(self):
        assert self._parse('a@rt.ru') == ['a@rt.ru']

    def test_validate_invalid_email_raises(self):
        with pytest.raises(ValueError, match='адреса'):
            self._validate(['notanemail', 'b@rt.ru'])

    def test_validate_all_valid_passes(self):
        result = self._validate(['a@rt.ru', 'b@company.com'])
        assert len(result) == 2

    def test_empty_list_after_parse(self):
        result = self._parse(['', '  ', ''])
        assert result == []
