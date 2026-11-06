"""GET /api/version — версия приложения для плашки в интерфейсе."""

import os
import sys
import unittest.mock as mock
from unittest.mock import MagicMock

import pytest

for _mod in ('win32com', 'win32com.client', 'pythoncom', 'pywin32_runtime'):
    sys.modules.setdefault(_mod, MagicMock())
sys.modules.setdefault('exchangelib', MagicMock())
sys.modules.setdefault('exchangelib.errors', MagicMock())

with mock.patch.dict(os.environ, {'APP_MODE': 'admin'}):
    sys.modules.setdefault('app_admin', MagicMock())
    sys.modules.setdefault('app_user', MagicMock())
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    import app as email_app


@pytest.fixture
def client():
    email_app.app.config['TESTING'] = True
    return email_app.app.test_client()


def test_returns_current_version(client):
    resp = client.get('/api/version')
    assert resp.status_code == 200
    assert resp.get_json() == {'version': email_app.__version__}


def test_version_matches_pyproject(client):
    import re
    root = os.path.join(os.path.dirname(__file__), '..')
    text = open(os.path.join(root, 'pyproject.toml'), encoding='utf-8').read()
    declared = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE).group(1)
    assert client.get('/api/version').get_json()['version'] == declared
