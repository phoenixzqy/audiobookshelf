@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Audiobook Platform - Background Service
echo ============================================
echo.
echo This script runs the server in background mode.
echo Use stop-server.bat to stop it.
echo.

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
set LOG_DIR=%PROJECT_ROOT%\logs
set LOG_FILE=%LOG_DIR%\server.log

:: Create logs directory
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%PROJECT_ROOT%\backend"

echo [INFO] Starting server in background...
echo [INFO] Log file: %LOG_FILE%
echo.

:: Start node in background, redirect output to log file
start /B cmd /c "npm run dev >> "%LOG_FILE%" 2>&1"

echo [OK] Server started in background
echo [INFO] Check %LOG_FILE% for server output
echo.
