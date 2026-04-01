@echo off
setlocal

echo.
echo ============================================
echo   Email Builder - build Admin + User
echo ============================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found
    pause
    exit /b 1
)

echo [1/4] Installing dependencies...
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] pip install failed
    pause
    exit /b 1
)
echo        OK

echo [2/4] Tests...
if "%SKIP_TESTS%"=="1" (
    echo        SKIPPED  ^(SKIP_TESTS=1^)
) else (
    python -m pytest tests/ -q --tb=short
    if errorlevel 1 (
        echo.
        echo [WARNING] Some tests failed.
        choice /M "Continue build anyway?"
        if errorlevel 2 (
            echo Cancelled.
            pause
            exit /b 1
        )
    ) else (
        echo        OK
    )
)

echo [3/4] Cleaning dist/ and build/...
if exist dist\EmailBuilderAdmin.exe del /f dist\EmailBuilderAdmin.exe
if exist dist\EmailBuilderUser.exe  del /f dist\EmailBuilderUser.exe
if exist build rmdir /s /q build
echo        OK

echo [4/4] Building...
echo        Admin...
pyinstaller build_admin.spec --noconfirm
if errorlevel 1 (
    echo [ERROR] Admin build failed
    pause
    exit /b 1
)

echo        User...
pyinstaller build_user.spec --noconfirm
if errorlevel 1 (
    echo [ERROR] User build failed
    pause
    exit /b 1
)

echo [5/5] Copying config.ini to dist\...
if exist config.ini (
    copy /y config.ini dist\config.ini >nul
    echo        OK - config.ini скопирован
) else (
    echo [WARNING] config.ini не найден рядом с build.bat!
    echo           Создайте dist\config.ini вручную:
    echo           [app]
    echo           network_path = \\server\share\email-builder
    echo           port = 8080
    echo           mode = admin
)

echo.
echo ============================================
echo   Done!
echo   dist\EmailBuilderAdmin.exe
echo   dist\EmailBuilderUser.exe
echo   dist\config.ini
echo ============================================
echo.
pause