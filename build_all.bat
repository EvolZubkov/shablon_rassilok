@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

:: Builds every distributable in one go: 4 ZIPs for Windows and 4 ZIPs for ALT Linux
::   b2c, b2c without bulk mail ("nobulk"), hr, duz
::
:: Usage: build_all.bat [all|win|linux] [nopause]
::   all (default) - Windows + Linux     win - Windows only     linux - Linux only
::   nopause       - do not wait for a key at the end
::
:: Linux needs Docker (see build_linux_alt.bat). The Windows part needs Python + PyInstaller.
:: Set BUILD_NOBULK=0 below to skip the "without bulk mail" variants (build is much faster).
if not defined BUILD_NOBULK set "BUILD_NOBULK=1"

set "TARGET=all"
set "NOPAUSE=0"
for %%A in (%*) do (
    if /i "%%A"=="all"     set "TARGET=all"
    if /i "%%A"=="win"     set "TARGET=win"
    if /i "%%A"=="linux"   set "TARGET=linux"
    if /i "%%A"=="nopause" set "NOPAUSE=1"
)

echo.
echo ============================================
echo   Pochtelye - build ALL  [target: %TARGET%]
echo ============================================
echo.

if /i not "%TARGET%"=="win" (
    docker --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Docker not found or not running - it is required for the Linux builds.
        echo         Start Docker, or run: build_all.bat win
        goto error
    )
)

if /i not "%TARGET%"=="linux" (
    echo ---------- WINDOWS ----------
    call build_WIN.bat nopause
    if errorlevel 1 goto error
)

if /i not "%TARGET%"=="win" (
    echo ---------- LINUX ----------
    call build_linux_alt.bat nopause
    if errorlevel 1 goto error
)

:: ------------------------------------------------------------
:: Check that every expected ZIP exists
:: ------------------------------------------------------------
for /f "tokens=2 delims==" %%i in ('findstr /B /C:"__version__" src\_version.py') do set "VERSION=%%i"
set "VERSION=%VERSION: =%"
set "VERSION=%VERSION:"=%"

set "MISSING=0"
echo.
echo ============================================
echo   Result  [version %VERSION%]
echo ============================================
if /i not "%TARGET%"=="linux" call :check_platform win
if /i not "%TARGET%"=="win"   call :check_platform linux
echo ============================================

if not "%MISSING%"=="0" (
    echo   [ERROR] %MISSING% expected ZIP file^(s^) missing
    goto error
)
goto success


:: %1 - platform (win | linux)
:check_platform
call :check_zip "Pochtelye_b2c_%~1_v%VERSION%.zip"
if "%BUILD_NOBULK%"=="1" call :check_zip "Pochtelye_b2c_nobulk_%~1_v%VERSION%.zip"
call :check_zip "Pochtelye_hr_%~1_v%VERSION%.zip"
call :check_zip "Pochtelye_duz_%~1_v%VERSION%.zip"
exit /b 0

:: %1 - ZIP file name
:check_zip
if exist "%~1" (
    echo   [OK]      %~1
) else (
    echo   [MISSING] %~1
    set /a MISSING+=1
)
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
echo   Done. Distribute the ZIPs from this folder.
echo.
if "%NOPAUSE%"=="0" pause
exit /b 0
