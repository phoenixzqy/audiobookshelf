@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set LOG_FILE=%SCRIPT_DIR%background-start.log

echo ============================================
echo   Audiobook Platform - Background Service
echo ============================================
echo.
echo This script runs the server in background mode.
echo Use stop-server.bat to stop it.
echo.

:: Log start
echo ============================================ > "%LOG_FILE%"
echo   Background Start Log - %date% %time% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

set PROJECT_ROOT=%SCRIPT_DIR%..
set SERVER_LOG=%SCRIPT_DIR%server-output.log

cd /d "%PROJECT_ROOT%\backend"

echo [INFO] Starting server in background...
echo [INFO] Server output log: %SERVER_LOG%
echo.

echo [INFO] Starting server in background... >> "%LOG_FILE%"

:: Start node in background, redirect output to log file
start /B cmd /c "npm run dev >> "%SERVER_LOG%" 2>&1"

if %ERRORLEVEL% equ 0 (
    echo [OK] Server started in background
    echo [OK] Server started in background >> "%LOG_FILE%"
) else (
    echo [ERROR] Failed to start server
    echo [ERROR] Failed to start server >> "%LOG_FILE%"
)

echo [INFO] Check %SERVER_LOG% for server output
echo.
echo [INFO] To stop the server, run: stop-server.bat
echo.
pause
