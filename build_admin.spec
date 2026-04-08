# -*- mode: python ; coding: utf-8 -*-
# build_admin.spec — PyInstaller spec for the Admin build of Почтелье.
#
# Rendering strategy
# ------------------
# Windows : QWebEngineView (PyQtWebEngine wheel) bundles Chromium.
# Linux   : Same — PyQt5 + PyQtWebEngine are bundled here so the binary is
#           fully self-contained — no webkit2gtk, no root/sudo on the target.

import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files, collect_all

ROOT = os.path.abspath('.')


def maybe(src, dst):
    """Include a path only when it actually exists (avoids build errors)."""
    full = os.path.join(ROOT, src)
    if os.path.exists(full):
        return (full, dst)
    return None


# ── Static assets ─────────────────────────────────────────────────────────────
raw_datas = [
    maybe('static',                    'static'),
    maybe('js',                        'js'),
    maybe('templates',                 'templates'),
    maybe('index.html',                '.'),
    maybe('index-user.html',           '.'),
    maybe('styles.css',                '.'),
    maybe('user-styles.css',           '.'),
    maybe('theme-variables.css',       '.'),
    maybe('modular-styles.css',        '.'),
    maybe('figma-gradient-panel.css',  '.'),
]

for p, dst in collect_data_files('exchangelib'):
    raw_datas.append((p, dst))

datas = [x for x in raw_datas if x is not None]

try:
    import certifi
    datas.append((os.path.dirname(certifi.__file__), 'certifi'))
except ImportError:
    pass

# ── Collect Qt5 backend ───────────────────────────────────────────────────────
# collect_all() returns (datas, binaries, hiddenimports) for a package.
# We use try/except so the spec remains valid on a machine where PyQt5 is not
# installed (e.g. a CI host that hasn't installed PyQt5 yet).

extra_datas    = []
extra_binaries = []
extra_hidden   = []

for pkg in ('PyQt5', 'PyQtWebEngine'):
    try:
        d, b, h = collect_all(pkg)
        extra_datas    += d
        extra_binaries += b
        extra_hidden   += h
    except Exception:
        pass

datas += extra_datas

# ── Hidden imports ────────────────────────────────────────────────────────────
hiddenimports = [
    # Flask stack
    'flask', 'flask_cors',
    'werkzeug', 'werkzeug.utils', 'werkzeug.routing',
    'jinja2', 'click', 'itsdangerous', 'markupsafe',
    # Exchange / EWS
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
    # Crypto / HTTP / XML
    'cryptography',
    'cryptography.fernet',
    'cryptography.hazmat.primitives.hashes',
    'cryptography.hazmat.backends.openssl',
    'requests', 'urllib3', 'certifi', 'lxml', 'lxml.etree',
    # App modules
    'credentials_manager', 'exchange_sender', '_version',
    # Stdlib extras
    'configparser', 'hashlib', 'socket', 'pytz', 'atexit', 'signal',
    # Qt5 backend (collected above, listed explicitly as safety net)
    'PyQt5', 'PyQt5.QtCore', 'PyQt5.QtGui', 'PyQt5.QtWidgets',
    'PyQt5.QtNetwork', 'PyQt5.QtPrintSupport',
    # PyQtWebEngine — pip package name; modules it provides:
    'PyQtWebEngine',
    'PyQt5.QtWebEngineWidgets', 'PyQt5.QtWebEngineCore', 'PyQt5.QtWebChannel',
    *extra_hidden,
]

a = Analysis(
    ['app_admin.py'],
    pathex=[ROOT],
    binaries=extra_binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # GTK/WebKit2GTK backend — not needed; Qt5 backend is bundled instead.
        'gi', 'gi.repository',
        # Heavy unused libs.
        'matplotlib', 'numpy', 'pandas', 'pystray', 'PIL',
        # pywebview and PyQt6 are replaced by PyQt5.
        'webview', 'PyQt6',
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
    name='PochtelyeAdmin',
    debug=False,
    strip=False,
    upx=False,
    console=False,
    icon='icon.ico' if os.path.exists('icon.ico') else None,
    onefile=True,
)
