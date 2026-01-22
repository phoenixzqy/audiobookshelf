@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
set LOG_FILE=%SCRIPT_DIR%start-server.log

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

:: Step 1: Build frontend
echo [1/2] Building frontend...
echo [1/2] Building frontend... >> "%LOG_FILE%"
cd /d "%PROJECT_ROOT%\frontend"
call npm run build >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Frontend build failed!
    echo [ERROR] Check %LOG_FILE% for details
    pause
    exit /b 1
)
echo [OK] Frontend built successfully

:: Step 2: Start backend (serves both API and frontend)
echo [2/2] Starting server...
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
