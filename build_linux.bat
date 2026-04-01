@echo off
setlocal

echo.
echo ============================================
echo   Email Builder - Linux build via Docker
echo ============================================
echo.

docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker не найден или не запущен
    pause
    exit /b 1
)
echo [OK] Docker доступен

docker stop eb-builder >nul 2>&1
docker rm   eb-builder >nul 2>&1

echo [1/4] Запуск контейнера...
docker run -d --name eb-builder -v "%CD%:/app" debian:bullseye tail -f /dev/null
if errorlevel 1 (
    echo [ERROR] Не удалось запустить контейнер
    pause
    exit /b 1
)
echo        OK

echo [2/4] Установка системных зависимостей...

:: Пробуем apt-get update до 3 раз
docker exec eb-builder bash -c "for i in 1 2 3; do apt-get update -qq && break || echo Retry $i...; sleep 3; done"

:: Устанавливаем пакеты
docker exec eb-builder bash -c "apt-get install -y --fix-missing --no-install-recommends python3 python3-pip python3-venv python3-dev binutils gcc"
if errorlevel 1 (
    echo [ERROR] Ошибка установки пакетов
    goto cleanup
)
echo        OK

echo [3/4] Установка Python пакетов...
docker exec eb-builder bash -c "cd /app && python3 -m venv /tmp/venv && /tmp/venv/bin/pip install --upgrade pip && /tmp/venv/bin/pip install -r requirements.txt"
if errorlevel 1 (
    echo [ERROR] Ошибка pip install
    goto cleanup
)
echo        OK

echo [4/4] Сборка...
echo        Admin...
docker exec eb-builder bash -c "cd /app && /tmp/venv/bin/pyinstaller build_admin.spec --noconfirm --distpath dist/linux"
if errorlevel 1 (
    echo [ERROR] Admin build failed
    goto cleanup
)

echo        User...
docker exec eb-builder bash -c "cd /app && /tmp/venv/bin/pyinstaller build_user.spec --noconfirm --distpath dist/linux"
if errorlevel 1 (
    echo [ERROR] User build failed
    goto cleanup
)

if exist config.ini copy /y config.ini dist\linux\config.ini >nul

:cleanup
docker stop eb-builder >nul 2>&1
docker rm   eb-builder >nul 2>&1

echo.
echo ============================================
echo   Done!
echo   dist\linux\EmailBuilderAdmin
echo   dist\linux\EmailBuilderUser
echo ============================================
echo.
pause