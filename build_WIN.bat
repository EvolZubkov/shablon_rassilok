@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

:: Usage: build_WIN.bat [nopause]
::   nopause - do not wait for a key at the end (used by build_all.bat)
set "NOPAUSE=0"
if /i "%~1"=="nopause" set "NOPAUSE=1"

set "DIST_DIR=dist\win32"
set "WORK_DIR=build\app_win"
set "SPEC_FILE=build.spec"
set "DIST_DIR_NOBULK=dist\win32_nobulk"
set "WORK_DIR_NOBULK=build\app_win_nobulk"
:: 1 = кроме обычных сборок собрать для b2c вариант "без рассылок" (второй проход PyInstaller),
:: 0 = пропустить (сборка заметно быстрее)
if not defined BUILD_NOBULK set "BUILD_NOBULK=1"

echo.
echo ============================================
echo   Pochtelye - Windows build
echo ============================================
echo.

:: Проверка Python / PyInstaller
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10+ and add to PATH
    if "%NOPAUSE%"=="0" pause
    exit /b 1
)
echo [OK] Python available

:: Проверка обязательных файлов
if not exist requirements.txt (
    echo [ERROR] requirements.txt not found
    if "%NOPAUSE%"=="0" pause
    exit /b 1
)
if not exist %SPEC_FILE% (
    echo [ERROR] %SPEC_FILE% not found
    if "%NOPAUSE%"=="0" pause
    exit /b 1
)
if not exist scripts\sync_version.py (
    echo [ERROR] scripts\sync_version.py not found
    if "%NOPAUSE%"=="0" pause
    exit /b 1
)

echo [1/7] Installing dependencies...
python -m pip install --quiet -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    goto error
)
echo        OK

echo [2/7] Syncing version from pyproject.toml...
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

echo [3/7] Regenerating icon assets...
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

echo [4/7] Building Pochtelye.exe - with bulk mail...
call :build_exe "%DIST_DIR%" "%WORK_DIR%" "" "with bulk mail"
if errorlevel 1 goto error
echo        OK

if "%BUILD_NOBULK%"=="1" (
    echo [5/7] Building Pochtelye.exe - NO bulk mail, b2c only...
    call :build_exe "%DIST_DIR_NOBULK%" "%WORK_DIR_NOBULK%" "0" "no bulk mail"
    if errorlevel 1 goto error
    echo        OK
) else (
    echo [5/7] No-bulk build skipped - BUILD_NOBULK=0
)

echo [6/7] Preparing base config...
if exist config.ini (
    copy /y config.ini "%DIST_DIR%\config.ini" >nul
)
echo        OK

:: ------------------------------------------------------------
:: ZIP-архивация по профилям
:: ------------------------------------------------------------
echo [7/7] Preparing ZIP archives per profile...

call :cleanup_tmp

call :build_profile_zip "b2c" "config_template_b2c.ini" "%DIST_DIR%" ""
if errorlevel 1 goto error
call :build_profile_zip "hr" "config_template_hr.ini" "%DIST_DIR%" ""
if errorlevel 1 goto error
call :build_profile_zip "duz" "config_template_duz.ini" "%DIST_DIR%" ""
if errorlevel 1 goto error
if "%BUILD_NOBULK%"=="1" (
    call :build_profile_zip "b2c" "config_template_b2c.ini" "%DIST_DIR_NOBULK%" "_nobulk"
    if errorlevel 1 goto error
)

echo        OK: ZIPs created
goto success


:: Собирает один exe: %1 - каталог результата, %2 - рабочий каталог PyInstaller,
:: %3 - значение POCHTELYE_BULK_MAIL ("" - с рассылками, "0" - без), %4 - название для вывода.
:build_exe
set "EXE_DIST=%~1"
set "EXE_WORK=%~2"
set "POCHTELYE_BULK_MAIL=%~3"
python -m PyInstaller %SPEC_FILE% --noconfirm --distpath "%EXE_DIST%" --workpath "%EXE_WORK%" --clean
set "BUILD_RC=!errorlevel!"
set "POCHTELYE_BULK_MAIL="
if not "!BUILD_RC!"=="0" (
    echo [ERROR] Build failed: %~4
    exit /b 1
)
if not exist "%EXE_DIST%\Pochtelye.exe" (
    echo [ERROR] %EXE_DIST%\Pochtelye.exe not created - build did not complete
    exit /b 1
)

echo        Verifying bundled static files...
python scripts\verify_bundle.py "%EXE_DIST%\Pochtelye.exe"
if errorlevel 2 (
    echo [WARNING] Could not verify the bundle, check it manually
) else if errorlevel 1 (
    echo [ERROR] Built exe does not match the sources - rebuild
    exit /b 1
)
exit /b 0


:: %1 - профиль, %2 - шаблон config.ini, %3 - каталог с собранным exe, %4 - суффикс имени ZIP ("" или "_nobulk")
:build_profile_zip
set "PROFILE_NAME=%~1"
set "TEMPLATE_FILE=%~2"
set "SRC_DIR=%~3"
set "ZIP_SUFFIX=%~4"

set "TMP_DIR=%SRC_DIR%_tmp_%PROFILE_NAME%"
if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"
mkdir "%TMP_DIR%"

xcopy /Y /E "%SRC_DIR%\*" "%TMP_DIR%\" >nul

if not exist "%TEMPLATE_FILE%" (
    echo [ERROR] Template not found: %TEMPLATE_FILE%
    exit /b 1
)
copy /Y "%TEMPLATE_FILE%" "%TMP_DIR%\config.ini" >nul

set "ZIP_NAME=Pochtelye_%PROFILE_NAME%%ZIP_SUFFIX%_win_v%VERSION%.zip"
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
echo.
echo ============================================
echo   BUILD FAILED
echo ============================================
echo.
if "%NOPAUSE%"=="0" pause
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
if "%BUILD_NOBULK%"=="1" echo   Pochtelye_b2c_nobulk_win_v%VERSION%.zip  ^(b2c without bulk mail^)
echo.
echo Distribute to users:
echo   *.zip (внутри: Pochtelye.exe, config.ini)
echo ============================================
echo.
if "%NOPAUSE%"=="0" pause
exit /b 0
