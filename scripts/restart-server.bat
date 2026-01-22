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

:: Stop the server first
echo [INFO] Stopping server...
echo [INFO] Stopping server... >> "%LOG_FILE%"
call "%SCRIPT_DIR%stop-server.bat"

:: Wait a moment
echo [INFO] Waiting for cleanup...
timeout /t 2 /nobreak >nul

:: Start the server
echo [INFO] Starting server...
echo [INFO] Starting server... >> "%LOG_FILE%"
call "%SCRIPT_DIR%start-server.bat"

:: If we get here, something went wrong
echo.
echo [INFO] Server process ended.
echo.
pause
