@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

set "DIST_DIR=dist\win32"
set "WORK_DIR=build\app_win"
set "SPEC_FILE=build.spec"

echo.
echo ============================================
echo   Pochtelye - Windows build
echo ============================================
echo.

:: Проверка Python / PyInstaller
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10+ and add to PATH
    pause
    exit /b 1
)
echo [OK] Python available

:: Проверка обязательных файлов
if not exist requirements.txt (
    echo [ERROR] requirements.txt not found
    pause
    exit /b 1
)
if not exist %SPEC_FILE% (
    echo [ERROR] %SPEC_FILE% not found
    pause
    exit /b 1
)
if not exist scripts\sync_version.py (
    echo [ERROR] scripts\sync_version.py not found
    pause
    exit /b 1
)

echo [1/6] Installing dependencies...
python -m pip install --quiet -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    goto error
)
echo        OK

echo [2/6] Syncing version from pyproject.toml...
python scripts\sync_version.py
if errorlevel 1 (
    echo [ERROR] Failed to sync version
    goto error
)
echo        OK

:: ------------------------------------------------------------
:: ЧИТАЕМ ВЕРСИЮ ИЗ src/_version.py
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
:: ------------------------------------------------------------

echo [3/6] Regenerating icon assets...
python -m pip install --quiet Pillow
if errorlevel 1 (
    echo [ERROR] Failed to install Pillow
    goto error
)
python scripts\convert_icon.py --ico assets\icon.ico
if errorlevel 1 (
    echo [ERROR] Failed to regenerate icon.ico
    goto error
)
echo        OK

echo [4/6] Building Pochtelye.exe...
python -m PyInstaller %SPEC_FILE% --noconfirm --distpath "%DIST_DIR%" --workpath "%WORK_DIR%" --clean
if errorlevel 1 (
    echo [ERROR] Build failed
    goto error
)
if not exist "%DIST_DIR%\Pochtelye.exe" (
    echo [ERROR] %DIST_DIR%\Pochtelye.exe not created - build did not complete
    goto error
)
echo        OK

echo [5/6] Preparing base config...
if exist config.ini (
    copy /y config.ini "%DIST_DIR%\config.ini" >nul
)
echo        OK

:: ------------------------------------------------------------
:: ZIP-архивация по профилям
:: ------------------------------------------------------------
echo [6/6] Preparing ZIP archives per profile...

call :cleanup_tmp

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

set "ZIP_NAME=Pochtelye_%PROFILE_NAME%_win_v%VERSION%.zip"
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
exit /b 0


:error
echo.
echo ============================================
echo   BUILD FAILED
echo ============================================
echo.
pause
exit /b 1

:success
echo.
echo ============================================
echo   Done!
echo.
echo Generated ZIPs:
echo   Pochtelye_b2c_win_v%VERSION%.zip
echo   Pochtelye_hr_win_v%VERSION%.zip
echo   Pochtelye_duz_win_v%VERSION%.zip
echo.
echo Distribute to users:
echo   *.zip (внутри: Pochtelye.exe, config.ini)
echo ============================================
echo.
pause
exit /b 0
