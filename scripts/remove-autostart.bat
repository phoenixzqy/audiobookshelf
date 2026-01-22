@echo off
echo ============================================
echo   Remove Auto-Start Task
echo ============================================
echo.

:: Check for admin rights
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Please run this script as Administrator!
    pause
    exit /b 1
)

set TASK_NAME=AudiobookshelfServer

schtasks /delete /tn "%TASK_NAME%" /f

if %ERRORLEVEL% equ 0 (
    echo [OK] Auto-start task removed successfully
) else (
    echo [WARNING] Task may not exist or could not be removed
)

echo.
pause
