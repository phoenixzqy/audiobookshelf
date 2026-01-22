@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set LOG_FILE=%SCRIPT_DIR%start-server.log

echo ============================================
echo   Audiobook Platform - Start Server
echo ============================================
echo.

:: Log start time
echo ============================================ > "%LOG_FILE%"
echo   Server Start Log - %date% %time% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

set PROJECT_ROOT=%SCRIPT_DIR%..

:: Start server in background using VBScript (no visible window)
echo [INFO] Starting server in background...
echo [INFO] Starting server in background... >> "%LOG_FILE%"

cscript //nologo "%SCRIPT_DIR%silent-start.vbs"

if %ERRORLEVEL% equ 0 (
    echo [OK] Server started in background
    echo [OK] Server started successfully at %date% %time% >> "%LOG_FILE%"
) else (
    echo [ERROR] Failed to start server
    echo [ERROR] Failed to start server >> "%LOG_FILE%"
)

echo.
echo [INFO] Server URL: http://localhost:8081
echo [INFO] Admin: admin@test.com / admin
echo.
echo [INFO] Server is running in background.
echo [INFO] Use stop-server.bat to stop it.
echo [INFO] Check logs at: %PROJECT_ROOT%\logs\server.log
echo.

:: Auto-close after 5 seconds
echo This window will close in 5 seconds...
timeout /t 5 /nobreak >nul
