@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

set "IMAGE_NAME=emailbuilder-alt-p10"
set "CONTAINER_NAME=eb-builder-%RANDOM%"
set "DIST_DIR=dist\linux"

echo.
echo ============================================
echo   Pochtelye - ALT Linux p10 build
echo ============================================
echo.

:: Проверка Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker not found or not running
    pause
    exit /b 1
)
echo [OK] Docker available

:: Проверка обязательных файлов
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

:: Очистка зависших контейнеров от предыдущих прерванных запусков
:: (иначе примонтированный том может конфликтовать с новым контейнером)
echo Cleaning up leftover eb-builder-* containers...
for /f "delims=" %%C in ('docker ps -a --filter "name=eb-builder-" --format "{{.Names}}" 2^>nul') do (
    docker rm -f "%%C" >nul 2>&1
)

echo [1/6] Building Docker image ALT p10...
docker build -t %IMAGE_NAME% -f Dockerfile.alt-p10-builder .
if errorlevel 1 (
    echo [ERROR] Failed to build Docker image
    goto error
)
echo        OK

echo [2/6] Starting container...
docker run -d --name %CONTAINER_NAME% -v "%CD%:/app" %IMAGE_NAME% tail -f /dev/null
if errorlevel 1 (
    echo [ERROR] Failed to start container
    goto error
)
echo        OK

echo [3/6] Syncing version from pyproject.toml...
docker exec %CONTAINER_NAME% bash -c "cd /app && python3 scripts/sync_version.py"
if errorlevel 1 (
    echo [ERROR] Failed to sync version
    goto error
)
echo        OK

:: ------------------------------------------------------------
:: ЧИТАЕМ ВЕРСИЮ ИЗ src/_version.py (вместо парсинга pyproject.toml)
:: ------------------------------------------------------------
echo Reading version from src/_version.py ...
if not exist "src\_version.py" (
    echo [ERROR] src/_version.py not found after sync_version.py
    goto error
)
for /f "tokens=2 delims==" %%i in ('findstr /B /C:"__version__" src\_version.py') do set "VERSION=%%i"
set "VERSION=%VERSION: =%"
set "VERSION=%VERSION:"=%"

if "%VERSION%"=="" (
    echo [WARNING] Could not parse version, using 0.0.0
    set "VERSION=0.0.0"
)
echo Using version: %VERSION%
:: ------------------------------------------------------------

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


:: ------------------------------------------------------------
:: ZIP-архивация по профилям
:: ------------------------------------------------------------
echo [7/7] Preparing ZIP archives per profile...

for /d %%D in ("%DIST_DIR%_tmp_*") do rmdir /s /q "%%D" 2>nul

call :build_profile_zip "b2c" "config_template_b2c.ini"
if errorlevel 1 goto error
call :build_profile_zip "hr" "config_template_hr.ini"
if errorlevel 1 goto error
call :build_profile_zip "duz" "config_template_duz.ini"
if errorlevel 1 goto error

echo        OK: ZIPs created
goto success


:build_profile_zip
set "PROFILE_NAME=%~1"
set "TEMPLATE_FILE=%~2"

set "TMP_DIR=%DIST_DIR%_tmp_%PROFILE_NAME%"
if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"
mkdir "%TMP_DIR%"

xcopy /Y /E "%DIST_DIR%\*" "%TMP_DIR%\" >nul

if not exist "%TEMPLATE_FILE%" (
    echo [ERROR] Template not found: %TEMPLATE_FILE%
    exit /b 1
)
copy /Y "%TEMPLATE_FILE%" "%TMP_DIR%\config.ini" >nul

set "ZIP_NAME=Pochtelye_%PROFILE_NAME%_linux_v%VERSION%.zip"
set "ZIP_FULL=%CD%\%ZIP_NAME%"

if exist "%ZIP_FULL%" del /Q "%ZIP_FULL%"

powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('%TMP_DIR%', '%ZIP_FULL%')"

if errorlevel 1 (
    echo [ERROR] Failed to create ZIP for profile %PROFILE_NAME%
    exit /b 1
)

rmdir /s /q "%TMP_DIR%"

echo        OK: %ZIP_NAME%
exit /b 0



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
echo.
echo Generated ZIPs:
echo   Pochtelye_b2c_linux_v%VERSION%.zip
echo   Pochtelye_hr_linux_v%VERSION%.zip
echo   Pochtelye_duz_linux_v%VERSION%.zip
echo.
echo Distribute to users:
echo   *.zip (внутри: Pochtelye.sh, Pochtelye, icon.png, config.ini)
echo.
echo Install on ALT Linux:
echo   bash Pochtelye.sh
echo ============================================
echo.
pause
exit /b 0

:cleanup
docker stop %CONTAINER_NAME% >nul 2>&1
docker rm   %CONTAINER_NAME% >nul 2>&1
exit /b 0
