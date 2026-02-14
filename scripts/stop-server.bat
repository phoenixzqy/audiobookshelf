@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
set LOG_DIR=%PROJECT_ROOT%\logs
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set LOG_FILE=%LOG_DIR%\stop-server.log

echo ============================================
echo   Audiobook Platform - Stop Server
echo ============================================
echo.

:: Log start
echo ============================================ > "%LOG_FILE%"
echo   Stop Server Log - %date% %time% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

:: Find and kill Node.js processes running on port 8081
echo [INFO] Looking for processes on port 8081...
echo [INFO] Looking for processes on port 8081... >> "%LOG_FILE%"

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

:: Also kill any node processes that might be related
echo [INFO] Checking for related Node.js processes...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %ERRORLEVEL% equ 0 (
    echo [WARNING] Other Node.js processes are still running.
    echo [INFO] Use 'taskkill /F /IM node.exe' to kill all Node processes if needed.
    echo [WARNING] Other Node.js processes are still running. >> "%LOG_FILE%"
)

echo.
echo [OK] Server stopped
echo [OK] Server stopped >> "%LOG_FILE%"
echo.
pause
