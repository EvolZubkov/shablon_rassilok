@echo off
setlocal
chcp 65001 >nul

set "IMAGE_NAME=emailbuilder-alt-p10"
set "CONTAINER_NAME=eb-builder-%RANDOM%"
set "DIST_DIR=dist\linux"

echo.
echo ============================================
echo   Pochtelye - ALT Linux p10 build
echo ============================================
echo.

docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker not found or not running
    pause
    exit /b 1
)
echo [OK] Docker available

if not exist Dockerfile.alt-p10-builder (
    echo [ERROR] Dockerfile.alt-p10-builder not found
    pause
    exit /b 1
)

if not exist requirements.txt (
    echo [ERROR] requirements.txt not found
    pause
    exit /b 1
)

if not exist build.spec (
    echo [ERROR] build.spec not found
    pause
    exit /b 1
)

echo [1/5] Building Docker image ALT p10...
docker build -t %IMAGE_NAME% -f Dockerfile.alt-p10-builder .
if errorlevel 1 (
    echo [ERROR] Failed to build Docker image
    pause
    exit /b 1
)
echo        OK

echo [2/5] Starting container...
docker run -d --name %CONTAINER_NAME% -v "%CD%:/app" %IMAGE_NAME% tail -f /dev/null
if errorlevel 1 (
    echo [ERROR] Failed to start container
    pause
    exit /b 1
)
echo        OK

echo [3/5] Syncing version from pyproject.toml...
docker exec %CONTAINER_NAME% bash -c "cd /app && python3 scripts/sync_version.py"
if errorlevel 1 (
    echo [ERROR] Failed to sync version
    goto error
)
echo        OK

echo [4/6] Regenerating icon assets...
docker exec %CONTAINER_NAME% bash -c "python3 -m pip install --quiet Pillow && python3 /app/scripts/convert_icon.py --ico /app/assets/icon.ico"
if errorlevel 1 (
    echo [ERROR] Failed to regenerate icon.ico
    goto error
)
echo        OK

echo [5/6] Building Pochtelye...
docker exec %CONTAINER_NAME% bash -c "cd /app && pyinstaller build.spec --noconfirm --distpath dist/linux --workpath build/app --clean"
if errorlevel 1 (
    echo [ERROR] Build failed
    goto error
)
echo        OK

echo [6/6] chmod +x, icon conversion, creating installer...
docker exec %CONTAINER_NAME% bash -c "chmod +x /app/dist/linux/Pochtelye"
if errorlevel 1 (
    echo [ERROR] Failed to set executable permissions
    goto error
)

docker exec %CONTAINER_NAME% bash -c "python3 -m pip install --quiet Pillow && python3 /app/scripts/convert_icon.py --png /app/dist/linux/icon.png || echo '[WARN] icon conversion failed'"
if exist config.ini (
    if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
    copy /y config.ini "%DIST_DIR%\config.ini" >nul
)

docker exec %CONTAINER_NAME% bash -c "sed -i 's/\r//' /app/scripts/make_installer.sh && bash /app/scripts/make_installer.sh /app/dist/linux"
if errorlevel 1 (
    echo [ERROR] Failed to create installer
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
echo   %DIST_DIR%\Pochtelye.sh
echo.
echo   Distribute to users:
echo     Pochtelye.sh
echo     config.ini
echo     .lic  (admins only)
echo.
echo   Install on ALT Linux:
echo     bash Pochtelye.sh
echo ============================================
echo.
pause
exit /b 0

:cleanup
docker stop %CONTAINER_NAME% >nul 2>&1
docker rm   %CONTAINER_NAME% >nul 2>&1
exit /b 0
