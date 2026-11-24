"""Логика решения «обновлять ли бинарник» в Linux-установщике (scripts/make_installer.sh).

Установщик обновлял бинарник только при строго большей версии: пересборка с той же
версией считалась «уже установлен и актуален», и пользователь оставался на старом
файле. Теперь при той же версии решает ещё и SHA256 бинарника.
"""

import re
import shlex
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / 'scripts' / 'make_installer.sh'



def _find_bash():
    """Настоящий bash. На Windows `bash` из PATH — прослойка WSL (System32), она искажает
    кавычки в -c; берём Git Bash рядом с git.exe."""
    found = shutil.which('bash')
    if found and 'system32' not in found.lower():
        return found
    git = shutil.which('git')
    if git:
        candidate = Path(git).resolve().parent.parent / 'bin' / 'bash.exe'
        if candidate.exists():
            return str(candidate)
    return None


BASH = _find_bash()
pytestmark = pytest.mark.skipif(BASH is None, reason='нужен bash (Git Bash или Linux)')


def _function(name: str) -> str:
    """Текст bash-функции из установщика (до закрывающей скобки в начале строки)."""
    text = SCRIPT.read_text(encoding='utf-8')
    match = re.search(rf'^{name}\(\) \{{.*?^\}}', text, re.MULTILINE | re.DOTALL)
    assert match, f'функция {name} не найдена в {SCRIPT.name}'
    return match.group(0)


def _needs_update(installer: str, installed: str, installed_sha: str, binary_sha: str) -> bool:
    call = '_needs_update ' + ' '.join(
        shlex.quote(value) for value in (installer, installed, installed_sha, binary_sha)
    )
    script = '\n'.join([_function('_version_gt'), _function('_needs_update'), call])
    result = subprocess.run([BASH, '-c', script], capture_output=True, text=True, timeout=30)
    assert result.returncode in (0, 1), result.stderr
    return result.returncode == 0


def test_newer_version_updates():
    assert _needs_update('2.10.1', '2.10.0', 'aaa', 'aaa')


def test_same_version_same_binary_is_up_to_date():
    assert not _needs_update('2.10.0', '2.10.0', 'aaa', 'aaa')


def test_same_version_different_binary_updates():
    # пересборка без смены версии — именно этот случай раньше оставлял старый файл
    assert _needs_update('2.10.0', '2.10.0', 'old', 'new')


def test_same_version_without_stored_hash_updates_once():
    # установка до появления binary.sha256: хеша нет, один раз переустанавливаем
    assert _needs_update('2.10.0', '2.10.0', '', 'new')


def test_older_installer_does_not_downgrade():
    assert not _needs_update('2.9.3', '2.10.0', 'old', 'new')


def test_missing_installed_version_updates():
    assert _needs_update('2.10.0', '', '', 'new')


def test_minor_ten_is_greater_than_nine():
    # сравнение по числам, а не по строкам: 2.10 новее 2.9
    assert _needs_update('2.10.0', '2.9.3', 'a', 'a')
