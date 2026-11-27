@echo off
setlocal
chcp 65001 >nul

:: Usage: build_linux_alt.bat [nopause]
::   nopause - do not wait for a key at the end (used by build_all.bat)
set "NOPAUSE=0"
if /i "%~1"=="nopause" set "NOPAUSE=1"

set "IMAGE_NAME=emailbuilder-alt-p10"
set "CONTAINER_NAME=eb-builder-%RANDOM%"
set "DIST_DIR=dist\linux"
set "DIST_DIR_NOBULK=dist\linux_nobulk"
:: 1 = additionally build the b2c "no bulk mail" variant (second PyInstaller pass), 0 = skip (build_all.bat can set it for both)
if not defined BUILD_NOBULK set "BUILD_NOBULK=1"

echo.
echo ============================================
echo   Pochtelye - ALT Linux p10 build
echo ============================================
echo.

docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker not found or not running
    if "%NOPAUSE%"=="0" pause
    exit /b 1
)
echo [OK] Docker available

if not exist Dockerfile.alt-p10-builder (
    echo [ERROR] Dockerfile.alt-p10-builder not found
    if "%NOPAUSE%"=="0" pause
    exit /b 1
)

if not exist requirements.txt (
    echo [ERROR] requirements.txt not found
    if "%NOPAUSE%"=="0" pause
    exit /b 1
)

if not exist build.spec (
    echo [ERROR] build.spec not found
    if "%NOPAUSE%"=="0" pause
    exit /b 1
)

echo [1/7] Building Docker image ALT p10...
docker build -t %IMAGE_NAME% -f Dockerfile.alt-p10-builder .
if errorlevel 1 (
    echo [ERROR] Failed to build Docker image
    if "%NOPAUSE%"=="0" pause
    exit /b 1
)
echo        OK

echo [2/7] Starting container...
docker run -d --name %CONTAINER_NAME% -v "%CD%:/app" %IMAGE_NAME% tail -f /dev/null
if errorlevel 1 (
    echo [ERROR] Failed to start container
    if "%NOPAUSE%"=="0" pause
    exit /b 1
)
echo        OK

echo [3/7] Syncing version from pyproject.toml...
docker exec %CONTAINER_NAME% bash -c "cd /app && python3 scripts/sync_version.py"
if errorlevel 1 (
    echo [ERROR] Failed to sync version
    goto error
)
echo        OK

:: ------------------------------------------------------------
:: Version from src\_version.py (the project folder is mounted into the container,
:: so sync_version.py has already updated it on the host)
:: ------------------------------------------------------------
echo Reading version from src\_version.py ...
if not exist "src\_version.py" (
    echo [ERROR] src\_version.py not found after sync_version.py
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

echo [4/7] Regenerating icon assets - on the host, the container has no Pillow and may have no network...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found on the host - it is needed for icon conversion
    goto error
)
python -m pip install --quiet Pillow
if errorlevel 1 (
    echo [ERROR] Failed to install Pillow on the host
    goto error
)
python scripts\convert_icon.py --ico assets\icon.ico
if errorlevel 1 (
    echo [ERROR] Failed to regenerate icon.ico
    goto error
)
echo        OK

echo [5/7] Building Pochtelye - with bulk mail...
docker exec %CONTAINER_NAME% bash -c "cd /app && pyinstaller build.spec --noconfirm --distpath dist/linux --workpath build/app --clean"
if errorlevel 1 (
    echo [ERROR] Build failed
    goto error
)
echo        OK

if "%BUILD_NOBULK%"=="1" (
    echo        Building Pochtelye - NO bulk mail, b2c only...
    docker exec -e POCHTELYE_BULK_MAIL=0 %CONTAINER_NAME% bash -c "cd /app && pyinstaller build.spec --noconfirm --distpath dist/linux_nobulk --workpath build/app_nobulk --clean"
    if errorlevel 1 (
        echo [ERROR] No-bulk build failed
        goto error
    )
    echo        OK
)

echo [6/7] chmod +x, icon conversion, creating installers...
docker exec %CONTAINER_NAME% bash -c "chmod +x /app/dist/linux/Pochtelye"
if errorlevel 1 (
    echo [ERROR] Failed to set executable permissions
    goto error
)

python scripts\convert_icon.py --png "%DIST_DIR%\icon.png"
if errorlevel 1 echo [WARN] icon conversion failed - the installer will have no icon
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

if "%BUILD_NOBULK%"=="1" (
    echo        Creating no-bulk installer...
    docker exec %CONTAINER_NAME% bash -c "chmod +x /app/dist/linux_nobulk/Pochtelye"
    if errorlevel 1 (
        echo [ERROR] Failed to set executable permissions on the no-bulk binary
        goto error
    )
    python scripts\convert_icon.py --png "%DIST_DIR_NOBULK%\icon.png"
    if errorlevel 1 echo [WARN] icon conversion failed - the installer will have no icon
    if exist config.ini (
        if not exist "%DIST_DIR_NOBULK%" mkdir "%DIST_DIR_NOBULK%"
        copy /y config.ini "%DIST_DIR_NOBULK%\config.ini" >nul
    )
    docker exec %CONTAINER_NAME% bash -c "bash /app/scripts/make_installer.sh /app/dist/linux_nobulk"
    if errorlevel 1 (
        echo [ERROR] Failed to create the no-bulk installer
        goto error
    )
    echo        OK
)

:: ------------------------------------------------------------
:: ZIP per profile: Pochtelye.sh (installer) + config.ini of the profile
:: ------------------------------------------------------------
echo [7/7] Preparing ZIP archives per profile...

call :cleanup_tmp

call :build_profile_zip "b2c" "config_template_b2c.ini" "%DIST_DIR%" ""
if errorlevel 1 goto error
if "%BUILD_NOBULK%"=="1" (
    call :build_profile_zip "b2c" "config_template_b2c.ini" "%DIST_DIR_NOBULK%" "_nobulk"
    if errorlevel 1 goto error
)
call :build_profile_zip "hr" "config_template_hr.ini" "%DIST_DIR%" ""
if errorlevel 1 goto error
call :build_profile_zip "duz" "config_template_duz.ini" "%DIST_DIR%" ""
if errorlevel 1 goto error

echo        OK: ZIPs created
goto success


:: %1 - profile, %2 - config.ini template, %3 - folder with Pochtelye.sh, %4 - ZIP name suffix ("" or "_nobulk")
:build_profile_zip
set "PROFILE_NAME=%~1"
set "TEMPLATE_FILE=%~2"
set "SRC_DIR=%~3"
set "ZIP_SUFFIX=%~4"

if not exist "%TEMPLATE_FILE%" (
    echo [ERROR] Template not found: %TEMPLATE_FILE%
    exit /b 1
)
if not exist "%SRC_DIR%\Pochtelye.sh" (
    echo [ERROR] Installer not found: %SRC_DIR%\Pochtelye.sh
    exit /b 1
)

set "TMP_DIR=%SRC_DIR%_tmp_%PROFILE_NAME%"
if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"
mkdir "%TMP_DIR%"
copy /Y "%SRC_DIR%\Pochtelye.sh" "%TMP_DIR%\Pochtelye.sh" >nul
copy /Y "%TEMPLATE_FILE%" "%TMP_DIR%\config.ini" >nul

set "ZIP_NAME=Pochtelye_%PROFILE_NAME%%ZIP_SUFFIX%_linux_v%VERSION%.zip"
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


:cleanup_tmp
for /d %%D in ("%DIST_DIR%_tmp_*") do rmdir /s /q "%%D" 2>nul
for /d %%D in ("%DIST_DIR_NOBULK%_tmp_*") do rmdir /s /q "%%D" 2>nul
exit /b 0


:error
call :cleanup
echo.
echo ============================================
echo   BUILD FAILED
echo ============================================
echo.
if "%NOPAUSE%"=="0" pause
exit /b 1

:success
call :cleanup
echo.
echo ============================================
echo   Done!
echo.
echo Generated ZIPs:
echo   Pochtelye_b2c_linux_v%VERSION%.zip
if "%BUILD_NOBULK%"=="1" echo   Pochtelye_b2c_nobulk_linux_v%VERSION%.zip  ^(b2c without bulk mail^)
echo   Pochtelye_hr_linux_v%VERSION%.zip
echo   Pochtelye_duz_linux_v%VERSION%.zip
echo.
echo Distribute to users: *.zip ^(inside: Pochtelye.sh, config.ini^)
echo   Admins also need .lic next to Pochtelye.sh
echo.
echo Install on ALT Linux: unzip, then
echo   bash Pochtelye.sh
echo ============================================
echo.
if "%NOPAUSE%"=="0" pause
exit /b 0

:cleanup
docker stop %CONTAINER_NAME% >nul 2>&1
docker rm   %CONTAINER_NAME% >nul 2>&1
exit /b 0
