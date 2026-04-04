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

if not exist build.spec (
    echo [ERROR] Файл build.spec не найден
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

echo [3/4] Синхронизация версии из pyproject.toml...
docker exec %CONTAINER_NAME% bash -c "cd /app && python3 sync_version.py"
if errorlevel 1 (
    echo [ERROR] Не удалось синхронизировать версию
    goto error
)
echo        OK

echo [4/4] Сборка EmailBuilder...
docker exec %CONTAINER_NAME% bash -c "cd /app && pyinstaller build.spec --noconfirm --distpath dist/linux --workpath build/app --clean"
if errorlevel 1 (
    echo [ERROR] Build failed
    goto error
)
echo        OK

echo [5/5] chmod +x, конвертация иконки, создание установщика...
docker exec %CONTAINER_NAME% bash -c "chmod +x /app/dist/linux/EmailBuilder"
if errorlevel 1 (
    echo [ERROR] Не удалось выставить права на исполнение
    goto error
)

docker exec %CONTAINER_NAME% bash -c "python3 -m pip install --quiet Pillow && python3 -c \"from PIL import Image; img=Image.open('/app/icon.ico'); img = img.convert('RGBA'); img.thumbnail((48,48)); img.save('/app/dist/linux/icon.png','PNG'); print('icon.png written')\" || echo '[WARN] icon conversion failed'"
if exist config.ini (
    if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
    copy /y config.ini "%DIST_DIR%\config.ini" >nul
)

docker exec %CONTAINER_NAME% bash -c "bash /app/make_installer.sh /app/dist/linux"
if errorlevel 1 (
    echo [ERROR] Не удалось создать установщик
    goto error
)
echo        OK

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
echo   %DIST_DIR%\EmailBuilder.sh
echo.
echo   Передать пользователю:
echo     EmailBuilder.sh
echo     config.ini
echo     .lic  (только для администраторов)
echo.
echo   Запуск на ALT Linux:
echo     bash EmailBuilder.sh
echo ============================================
echo.
pause
exit /b 0

:cleanup
docker stop %CONTAINER_NAME% >nul 2>&1
docker rm   %CONTAINER_NAME% >nul 2>&1
exit /b 0