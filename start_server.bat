@echo off
title Конструктор Писем - Сервер
color 0A

echo ========================================
echo   КОНСТРУКТОР ПИСЕМ
echo   Запуск сервера...
echo ========================================
echo.

REM Проверяем установку Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Python не найден!
    echo Установите Python с https://python.org
    pause
    exit /b 1
)

REM Проверяем зависимости
echo Проверка зависимостей...
pip show flask >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка Flask...
    pip install flask flask-cors pywin32
)

echo.
echo ========================================
echo   Сервер запущен!
echo ========================================
echo.
echo   Откройте в браузере:
echo   http://localhost:5000/index.html
echo.
echo   Для остановки: закройте это окно
echo ========================================
echo.

REM Запускаем Python сервер
python outlook_server.py

pause