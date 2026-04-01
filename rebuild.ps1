# rebuild.ps1 — сборка EmailBuilder.exe через PowerShell
# Запуск: .\rebuild.ps1
# Если не запускается: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

param(
    [switch]$SkipTests,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Email Builder — сборка"

function Write-Header($text) {
    Write-Host ""
    Write-Host ("═" * 48) -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ("═" * 48) -ForegroundColor Cyan
}

function Write-Step($n, $total, $text) {
    Write-Host "[$n/$total] $text..." -ForegroundColor Yellow
}

function Write-OK { Write-Host "      ✓ OK" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "      ✗ $msg" -ForegroundColor Red }

Write-Header "Email Builder — сборка .exe"

# ─── Зависимости ─────────────────────────────────────────────────────────────
if (-not $SkipInstall) {
    Write-Step 1 4 "Устанавливаем зависимости"
    pip install -r requirements.txt --quiet
    if ($LASTEXITCODE -ne 0) { Write-Fail "pip install провалился"; exit 1 }
    Write-OK
} else {
    Write-Host "[1/4] Зависимости — пропущено (-SkipInstall)" -ForegroundColor DarkGray
}

# ─── Тесты ───────────────────────────────────────────────────────────────────
if (-not $SkipTests) {
    Write-Step 2 4 "Запускаем тесты"
    python -m pytest tests/ -q --tb=short
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        $ans = Read-Host "  Тесты не прошли. Продолжить? (y/N)"
        if ($ans -notmatch '^[Yy]') { Write-Host "Отменено."; exit 1 }
    } else {
        Write-OK
    }
} else {
    Write-Host "[2/4] Тесты — пропущено (-SkipTests)" -ForegroundColor DarkGray
}

# ─── Очистка ─────────────────────────────────────────────────────────────────
Write-Step 3 4 "Очищаем dist/ и build/"
if (Test-Path "dist\EmailBuilder.exe") { Remove-Item "dist\EmailBuilder.exe" -Force }
if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
Write-OK

# ─── Сборка ──────────────────────────────────────────────────────────────────
Write-Step 4 4 "Собираем EmailBuilder.exe"
pyinstaller build_exe.spec --noconfirm
if ($LASTEXITCODE -ne 0) { Write-Fail "PyInstaller провалился"; exit 1 }
Write-OK

# ─── Конфиг ──────────────────────────────────────────────────────────────────
if (Test-Path "config.ini") {
    Copy-Item "config.ini" "dist\config.ini" -Force
    Write-Host "      Скопирован config.ini" -ForegroundColor DarkGray
}

# ─── Итог ────────────────────────────────────────────────────────────────────
Write-Header "Готово!"
$size = [math]::Round((Get-Item "dist\EmailBuilder.exe").Length / 1MB, 1)
Write-Host "  dist\EmailBuilder.exe  ($size MB)" -ForegroundColor White
if (Test-Path "dist\config.ini") {
    Write-Host "  dist\config.ini" -ForegroundColor White
}
Write-Host ""
Write-Host "  Для раздачи пользователям достаточно:" -ForegroundColor DarkGray
Write-Host "    EmailBuilder.exe + config.ini" -ForegroundColor DarkGray
Write-Host "    (credentials.json создаётся при первом запуске)" -ForegroundColor DarkGray
Write-Host ""
