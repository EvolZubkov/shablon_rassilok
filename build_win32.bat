@echo off
setlocal
chcp 65001 >nul

set "DIST_DIR=dist\win32"
set "WORK_DIR=build\app_win"
set "SPEC_FILE=build.spec"

echo.
echo ============================================
echo   Pochtelye - Windows build
echo ============================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10+ and add to PATH
    pause
    exit /b 1
)
echo [OK] Python available

python -m PyInstaller --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PyInstaller not installed. Run: pip install pyinstaller
    pause
    exit /b 1
)
echo [OK] PyInstaller available

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

echo.
echo [1/4] Installing dependencies...
python -m pip install --quiet -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo        OK

echo.
echo [2/4] Syncing version...
python scripts\sync_version.py
if errorlevel 1 (
    echo [ERROR] Failed to sync version
    pause
    exit /b 1
)
echo        OK

echo.
echo [3/4] Regenerating icon assets...
python -m pip install --quiet Pillow
if errorlevel 1 (
    echo [ERROR] Failed to install Pillow
    pause
    exit /b 1
)
python scripts\convert_icon.py --ico assets\icon.ico
if errorlevel 1 (
    echo [ERROR] Failed to regenerate icon.ico
    pause
    exit /b 1
)
echo        OK

echo.
echo [4/4] Building Pochtelye.exe...
python -m PyInstaller %SPEC_FILE% --noconfirm --distpath "%DIST_DIR%" --workpath "%WORK_DIR%" --clean
if errorlevel 1 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)
echo        OK

echo.
echo [5/5] Finalizing distribution...

if not exist "%DIST_DIR%" (
    echo [ERROR] %DIST_DIR% not created - build did not complete
    pause
    exit /b 1
)

if exist config.ini (
    if not exist "%DIST_DIR%\config.ini" (
        copy /y config.ini "%DIST_DIR%\config.ini" >nul
        echo        config.ini copied
    ) else (
        echo        config.ini already exists in %DIST_DIR%, skipping
    )
)

for /f "tokens=*" %%v in ('python -c "from _version import __version__; print(__version__)"') do set "VERSION=%%v"
if "%VERSION%"=="" set "VERSION=0.0.0"

echo %VERSION%> "%DIST_DIR%\version.txt"
echo        version.txt: %VERSION%

echo        OK

echo.
echo ============================================
echo   Done!
echo   %DIST_DIR%\Pochtelye.exe  (version %VERSION%)
echo.
echo   Distribute to users:
echo     Pochtelye.exe
echo     config.ini
echo     .lic  (admins only)
echo ============================================
echo.
pause
exit /b 0
