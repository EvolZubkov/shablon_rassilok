# -*- mode: python ; coding: utf-8 -*-
# build_admin.spec

import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

ROOT = os.path.abspath('.')

def maybe(src, dst):
    full = os.path.join(ROOT, src)
    if os.path.exists(full):
        return (full, dst)
    return None

raw_datas = [
    maybe('static',              'static'),
    maybe('js',                  'js'),
    maybe('templates',           'templates'),
    maybe('index.html',          '.'),
    maybe('index-user.html',     '.'),
    maybe('styles.css',          '.'),
    maybe('user-styles.css',     '.'),
    maybe('theme-variables.css', '.'),
    maybe('modular-styles.css',  '.'),
    maybe('figma-gradient-panel.css', '.'),
]

for p, dst in collect_data_files('exchangelib'):
    raw_datas.append((p, dst))

datas = [x for x in raw_datas if x is not None]

try:
    import certifi
    datas.append((os.path.dirname(certifi.__file__), 'certifi'))
except ImportError:
    pass

hiddenimports = [
    'flask', 'werkzeug', 'jinja2', 'click', 'itsdangerous', 'markupsafe',
    'werkzeug.utils', 'werkzeug.routing',
    'exchangelib',
    'exchangelib.autodiscover',
    'exchangelib.protocol',
    'exchangelib.transport',
    'exchangelib.credentials',
    'exchangelib.account',
    'exchangelib.folders',
    'exchangelib.items',
    'exchangelib.fields',
    'exchangelib.errors',
    *collect_submodules('exchangelib'),
    'cryptography',
    'cryptography.fernet',
    'cryptography.hazmat.primitives.hashes',
    'cryptography.hazmat.backends.openssl',
    'requests', 'urllib3', 'lxml', 'lxml.etree',
    'credentials_manager', 'exchange_sender',
    'configparser', 'hashlib', 'socket', 'pytz',
    'tkinter', 'tkinter.messagebox',
]

a = Analysis(
    ['app_user.py'],
    pathex=[ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'win32com', 'win32com.client', 'pythoncom', 'pywintypes',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='EmailBuilderUser',
    debug=False,
    strip=False,
    upx=False,
    console=False,
    icon='icon.ico' if os.path.exists('icon.ico') else None,
    onefile=True,
)
