@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Audiobook Platform - Start Server
echo ============================================
echo.

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..

cd /d "%PROJECT_ROOT%\backend"

echo [INFO] Starting server on port 8081...
echo [INFO] Server URL: http://localhost:8081
echo [INFO] Admin: admin@test.com / admin
echo.
echo [INFO] Press Ctrl+C to stop
echo.

call npm run dev
