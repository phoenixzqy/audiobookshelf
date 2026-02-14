@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
set LOG_DIR=%PROJECT_ROOT%\logs
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set LOG_FILE=%LOG_DIR%\start-server.log

echo ============================================
echo   Audiobook Platform - Start Server
echo ============================================
echo.
echo [INFO] Logging to: %LOG_FILE%
echo.

:: Log start time
echo ============================================ > "%LOG_FILE%"
echo   Server Start Log - %date% %time% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

:: Start backend
echo [INFO] Starting server...
cd /d "%PROJECT_ROOT%\backend"

echo.
echo [INFO] Server URL: http://localhost:8081
echo [INFO] Admin: admin@test.com / admin
echo.
echo [INFO] Press Ctrl+C to stop
echo.

:: Run server (output goes to both console and log)
call npm run dev
set EXIT_CODE=%ERRORLEVEL%

:: Log exit
echo. >> "%LOG_FILE%"
echo [INFO] Server stopped with exit code %EXIT_CODE% at %date% %time% >> "%LOG_FILE%"

:: If we get here, server stopped
echo.
echo [INFO] Server stopped.
echo [INFO] Check log file: %LOG_FILE%
echo.
pause
