@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set LOG_FILE=%SCRIPT_DIR%restart-server.log

echo ============================================
echo   Audiobook Platform - Restart Server
echo ============================================
echo.

:: Log start
echo ============================================ > "%LOG_FILE%"
echo   Restart Server Log - %date% %time% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

:: Stop the server first (inline to avoid calling another bat file that auto-closes)
echo [INFO] Stopping server...
echo [INFO] Stopping server... >> "%LOG_FILE%"

set FOUND_PROCESS=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8081 ^| findstr LISTENING 2^>nul') do (
    set FOUND_PROCESS=1
    echo [INFO] Found process PID: %%a
    echo [INFO] Found process PID: %%a >> "%LOG_FILE%"
    taskkill /F /PID %%a >nul 2>nul
    if !ERRORLEVEL! equ 0 (
        echo [OK] Killed process %%a
        echo [OK] Killed process %%a >> "%LOG_FILE%"
    ) else (
        echo [WARNING] Could not kill process %%a
        echo [WARNING] Could not kill process %%a >> "%LOG_FILE%"
    )
)

if %FOUND_PROCESS% equ 0 (
    echo [INFO] No process found listening on port 8081
    echo [INFO] No process found listening on port 8081 >> "%LOG_FILE%"
)

:: Wait a moment
echo [INFO] Waiting for cleanup...
timeout /t 2 /nobreak >nul

:: Start the server in background
echo [INFO] Starting server in background...
echo [INFO] Starting server in background... >> "%LOG_FILE%"

cscript //nologo "%SCRIPT_DIR%silent-start.vbs"

if %ERRORLEVEL% equ 0 (
    echo [OK] Server restarted in background
    echo [OK] Server restarted successfully >> "%LOG_FILE%"
) else (
    echo [ERROR] Failed to start server
    echo [ERROR] Failed to start server >> "%LOG_FILE%"
)

echo.
echo [INFO] Server URL: http://localhost:8081
echo [INFO] Use stop-server.bat to stop it.
echo.

:: Auto-close after 5 seconds
echo This window will close in 5 seconds...
timeout /t 5 /nobreak >nul
