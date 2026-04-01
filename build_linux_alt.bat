@echo off
setlocal
chcp 65001 >nul

set "IMAGE_NAME=emailbuilder-alt-p10"
set "CONTAINER_NAME=eb-builder-%RANDOM%"
set "DIST_DIR=dist\linux"

echo.
echo ============================================
echo   Email Builder - ALT Linux p10 build
echo ============================================
echo.

docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker не найден или не запущен
    pause
    exit /b 1
)
echo [OK] Docker доступен

if not exist Dockerfile.alt-p10-builder (
    echo [ERROR] Файл Dockerfile.alt-p10-builder не найден
    pause
    exit /b 1
)

if not exist requirements.txt (
    echo [ERROR] Файл requirements.txt не найден
    pause
    exit /b 1
)

if not exist build_admin.spec (
    echo [ERROR] Файл build_admin.spec не найден
    pause
    exit /b 1
)

if not exist build_user.spec (
    echo [ERROR] Файл build_user.spec не найден
    pause
    exit /b 1
)

echo [1/5] Сборка Docker-образа ALT p10...
docker build -t %IMAGE_NAME% -f Dockerfile.alt-p10-builder .
if errorlevel 1 (
    echo [ERROR] Не удалось собрать Docker-образ
    pause
    exit /b 1
)
echo        OK

echo [2/5] Запуск контейнера...
docker run -d --name %CONTAINER_NAME% -v "%CD%:/app" %IMAGE_NAME% tail -f /dev/null
if errorlevel 1 (
    echo [ERROR] Не удалось запустить контейнер
    pause
    exit /b 1
)
echo        OK

echo [3/5] Установка Python пакетов...
docker exec %CONTAINER_NAME% bash -lc "cd /app && python3 -m virtualenv /tmp/venv && /tmp/venv/bin/python -m pip install --upgrade pip setuptools wheel && /tmp/venv/bin/python -m pip install -r requirements.txt pyinstaller"
if errorlevel 1 (
    echo [ERROR] Ошибка установки Python пакетов
    goto error
)
echo        OK

echo [4/5] Сборка Admin...
docker exec %CONTAINER_NAME% bash -lc "cd /app && /tmp/venv/bin/pyinstaller build_admin.spec --noconfirm --distpath dist/linux --workpath build/admin --clean"
if errorlevel 1 (
    echo [ERROR] Admin build failed
    goto error
)
echo        OK

echo [5/5] Сборка User...
docker exec %CONTAINER_NAME% bash -lc "cd /app && /tmp/venv/bin/pyinstaller build_user.spec --noconfirm --distpath dist/linux --workpath build/user --clean"
if errorlevel 1 (
    echo [ERROR] User build failed
    goto error
)
echo        OK

if exist config.ini (
    if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
    copy /y config.ini "%DIST_DIR%\config.ini" >nul
)

goto success

:error
call :cleanup
echo.
echo ============================================
echo   BUILD FAILED
echo ============================================
echo.
pause
exit /b 1

:success
call :cleanup
echo.
echo ============================================
echo   Done!
echo   %DIST_DIR%\EmailBuilderAdmin
echo   %DIST_DIR%\EmailBuilderUser
echo ============================================
echo.
pause
exit /b 0

:cleanup
docker stop %CONTAINER_NAME% >nul 2>&1
docker rm   %CONTAINER_NAME% >nul 2>&1
exit /b 0