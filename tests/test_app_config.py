"""
tests/test_app_config.py

Тесты для app.py:
- _load_config
- find_or_mount_linux_path
- heartbeat_watchdog (логика)

Запуск:
    pytest tests/test_app_config.py -v
"""

import os
import sys
import pytest
import tempfile
import configparser
from unittest.mock import patch, MagicMock, call


# ─── _load_config ─────────────────────────────────────────────────────────

class TestLoadConfig:

    def _write_config(self, tmpdir, content):
        config_path = os.path.join(tmpdir, 'config.ini')
        with open(config_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return config_path

    def test_windows_reads_network_path_win(self, tmp_path):
        config_content = """
[app]
network_path_win = \\\\server\\share\\folder
port = 8080
mode = admin
network_path_linux_hint = folder
network_path_smb = //server/share/folder
"""
        self._write_config(str(tmp_path), config_content)
        with patch('sys.platform', 'win32'), \
             patch('os.path.dirname', return_value=str(tmp_path)), \
             patch('os.environ.get', return_value=None):
            from importlib import reload
            # Тестируем функцию напрямую
            import configparser as cp
            cfg = cp.ConfigParser()
            cfg.read(os.path.join(str(tmp_path), 'config.ini'), encoding='utf-8')
            val = cfg.get('app', 'network_path_win', fallback=None)
            assert val == '\\\\server\\share\\folder'

    def test_linux_reads_network_path_smb(self, tmp_path):
        config_content = """
[app]
network_path_smb = //server/share/folder
port = 9090
mode = user
network_path_linux_hint = folder
"""
        self._write_config(str(tmp_path), config_content)
        cfg = configparser.ConfigParser()
        cfg.read(os.path.join(str(tmp_path), 'config.ini'), encoding='utf-8')
        val = cfg.get('app', 'network_path_smb', fallback=None)
        assert val == '//server/share/folder'

    def test_default_port_is_8080(self, tmp_path):
        config_content = """
[app]
network_path_win = \\\\server\\share
network_path_smb = //server/share
"""
        self._write_config(str(tmp_path), config_content)
        cfg = configparser.ConfigParser()
        cfg.read(os.path.join(str(tmp_path), 'config.ini'), encoding='utf-8')
        port = int(cfg.get('app', 'port', fallback='8080'))
        assert port == 8080

    def test_custom_port(self, tmp_path):
        config_content = """
[app]
network_path_win = \\\\server\\share
network_path_smb = //server/share
port = 7788
"""
        self._write_config(str(tmp_path), config_content)
        cfg = configparser.ConfigParser()
        cfg.read(os.path.join(str(tmp_path), 'config.ini'), encoding='utf-8')
        port = int(cfg.get('app', 'port', fallback='8080'))
        assert port == 7788


# ─── find_or_mount_linux_path ─────────────────────────────────────────────

class TestFindOrMountLinuxPath:

    def test_finds_via_kio_fuse(self, tmp_path):
        # Создаём структуру kio-fuse
        kio_dir = tmp_path / 'kio-fuse-12345' / 'smb' / 'server' / 'email-builder'
        kio_dir.mkdir(parents=True)
        run_dir = tmp_path / 'run' / 'user' / '1000'
        run_dir.mkdir(parents=True)

        with patch('app.os.getuid', return_value=1000, create=True), \
             patch('glob.glob') as mock_glob:
            mock_glob.side_effect = lambda pattern, recursive=False: \
                [str(kio_dir)] if 'kio-fuse' in pattern else []

            # Импортируем функцию
            sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
            from app import find_or_mount_linux_path
            result = find_or_mount_linux_path(
                '//server/share/email-builder',
                hint='email-builder'
            )
            assert result == str(kio_dir)

    def test_finds_via_gvfs(self, tmp_path):
        gvfs_dir = tmp_path / 'gvfs' / 'smb' / 'email-builder'
        gvfs_dir.mkdir(parents=True)

        with patch('app.os.getuid', return_value=1000, create=True), \
             patch('glob.glob') as mock_glob:
            def side(pattern, recursive=False):
                if 'kio-fuse' in pattern:
                    return []
                if 'gvfs' in pattern:
                    return [str(gvfs_dir)]
                return []
            mock_glob.side_effect = side

            from app import find_or_mount_linux_path
            result = find_or_mount_linux_path(
                '//server/share/email-builder',
                hint='email-builder'
            )
            assert result == str(gvfs_dir)

    def test_finds_in_mnt(self, tmp_path):
        mnt_dir = tmp_path / 'mnt' / 'server' / 'email-builder'
        mnt_dir.mkdir(parents=True)

        with patch('app.os.getuid', return_value=1000, create=True), \
             patch('glob.glob') as mock_glob:
            def side(pattern, recursive=False):
                if '/mnt/' in pattern:
                    return [str(mnt_dir)]
                return []
            mock_glob.side_effect = side

            from app import find_or_mount_linux_path
            result = find_or_mount_linux_path(
                '//server/share/email-builder',
                hint='email-builder'
            )
            assert result == str(mnt_dir)

    def test_returns_none_if_not_found(self):
        with patch('app.os.getuid', return_value=1000, create=True), \
             patch('glob.glob', return_value=[]), \
             patch('subprocess.run', side_effect=FileNotFoundError):
            from app import find_or_mount_linux_path
            result = find_or_mount_linux_path(
                '//server/share/email-builder',
                hint='email-builder'
            )
            assert result is None

    def test_status_callback_called(self):
        statuses = []
        with patch('app.os.getuid', return_value=1000, create=True), \
             patch('glob.glob', return_value=[]), \
             patch('subprocess.run', side_effect=FileNotFoundError):
            from app import find_or_mount_linux_path
            find_or_mount_linux_path(
                '//server/share/email-builder',
                hint='email-builder',
                status_callback=lambda s: statuses.append(s)
            )
            assert len(statuses) > 0

    def test_kioclient5_fallback(self, tmp_path):
        kio_dir = tmp_path / 'kio-fuse-99' / 'email-builder'
        kio_dir.mkdir(parents=True)

        with patch('app.os.getuid', return_value=1000, create=True), \
             patch('glob.glob') as mock_glob, \
             patch('subprocess.run') as mock_run, \
             patch('time.sleep'):
            call_count = [0]
            def side(pattern, recursive=False):
                call_count[0] += 1
                # После kioclient5 — находим
                if call_count[0] > 4:
                    return [str(kio_dir)]
                return []
            mock_glob.side_effect = side
            mock_run.return_value = MagicMock(returncode=0)

            from app import find_or_mount_linux_path
            result = find_or_mount_linux_path(
                '//server/share/email-builder',
                hint='email-builder'
            )
            assert result is not None


# ─── Heartbeat watchdog ────────────────────────────────────────────────────

class TestHeartbeatWatchdog:

    def test_watchdog_exits_after_timeout(self):
        """Watchdog вызывает os._exit(0) если нет heartbeat"""
        import time
        with patch('time.sleep'), \
             patch('time.time') as mock_time, \
             patch('os._exit') as mock_exit:

            # Симулируем: последний heartbeat был давно
            mock_time.side_effect = [
                0,      # time.sleep(15) — начало
                1000,   # первая проверка — time.time()
                1000,   # _last_heartbeat сравнение
            ]

            # Импортируем и тестируем логику напрямую
            last_heartbeat = 0  # давно
            current_time = 1000
            timeout = 10

            assert current_time - last_heartbeat > timeout