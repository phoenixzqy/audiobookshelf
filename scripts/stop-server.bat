@echo off
echo ============================================
echo   Audiobook Platform - Stop Server
echo ============================================
echo.

:: Find and kill Node.js processes running on port 8081
echo [INFO] Looking for processes on port 8081...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8081 ^| findstr LISTENING') do (
    echo [INFO] Found process PID: %%a
    taskkill /F /PID %%a >nul 2>nul
    if !ERRORLEVEL! equ 0 (
        echo [OK] Killed process %%a
    ) else (
        echo [WARNING] Could not kill process %%a
    )
)

:: Also kill any node processes that might be related
echo [INFO] Checking for related Node.js processes...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %ERRORLEVEL% equ 0 (
    echo [WARNING] Other Node.js processes are still running.
    echo [INFO] Use 'taskkill /F /IM node.exe' to kill all Node processes if needed.
)

echo.
echo [OK] Server stopped
echo.
pause
