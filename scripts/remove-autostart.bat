@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set LOG_FILE=%SCRIPT_DIR%remove-autostart.log

echo ============================================
echo   Remove Auto-Start Task
echo ============================================
echo.

:: Log start
echo ============================================ > "%LOG_FILE%"
echo   Remove Auto-Start Log - %date% %time% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

:: Check for admin rights
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Please run this script as Administrator!
    echo [ERROR] Please run this script as Administrator! >> "%LOG_FILE%"
    pause
    exit /b 1
)

set TASK_NAME=AudiobookshelfServer

echo [INFO] Removing task: %TASK_NAME%
echo [INFO] Removing task: %TASK_NAME% >> "%LOG_FILE%"

schtasks /delete /tn "%TASK_NAME%" /f >> "%LOG_FILE%" 2>&1

if %ERRORLEVEL% equ 0 (
    echo [OK] Auto-start task removed successfully
    echo [OK] Auto-start task removed successfully >> "%LOG_FILE%"
) else (
    echo [WARNING] Task may not exist or could not be removed
    echo [WARNING] Task may not exist or could not be removed >> "%LOG_FILE%"
)

echo.
pause
