@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set LOG_FILE=%SCRIPT_DIR%background-start.log

echo ============================================
echo   Audiobook Platform - Background Service
echo ============================================
echo.

:: Log start
echo ============================================ > "%LOG_FILE%"
echo   Background Start Log - %date% %time% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

set PROJECT_ROOT=%SCRIPT_DIR%..

echo [INFO] Starting server in background...
echo [INFO] Starting server in background... >> "%LOG_FILE%"

:: Start using VBScript for truly hidden execution
cscript //nologo "%SCRIPT_DIR%silent-start.vbs"

if %ERRORLEVEL% equ 0 (
    echo [OK] Server started in background
    echo [OK] Server started successfully >> "%LOG_FILE%"
) else (
    echo [ERROR] Failed to start server
    echo [ERROR] Failed to start server >> "%LOG_FILE%"
)

echo.
echo [INFO] Server URL: http://localhost:8081
echo [INFO] Server output log: %PROJECT_ROOT%\logs\server.log
echo.
echo [INFO] To stop the server, run: stop-server.bat
echo.

:: Auto-close after 5 seconds
echo This window will close in 5 seconds...
timeout /t 5 /nobreak >nul
