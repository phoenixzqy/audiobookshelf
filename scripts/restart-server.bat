@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Audiobook Platform - Restart Server
echo ============================================
echo.

set SCRIPT_DIR=%~dp0

:: Stop the server first
echo [INFO] Stopping server...
call "%SCRIPT_DIR%stop-server.bat"

:: Wait a moment
timeout /t 2 /nobreak >nul

:: Start the server
echo [INFO] Starting server...
call "%SCRIPT_DIR%start-server.bat"
