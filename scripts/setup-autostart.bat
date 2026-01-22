@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set LOG_FILE=%SCRIPT_DIR%setup-autostart.log

echo ============================================
echo   Setup Auto-Start on Windows Boot
echo ============================================
echo.
echo This will create a Windows Task Scheduler task
echo to automatically start the server when Windows boots.
echo.
echo [!] This script requires Administrator privileges.
echo.

:: Log start
echo ============================================ > "%LOG_FILE%"
echo   Setup Auto-Start Log - %date% %time% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

:: Check for admin rights
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Please run this script as Administrator!
    echo [ERROR] Please run this script as Administrator! >> "%LOG_FILE%"
    echo Right-click on this file and select "Run as administrator"
    pause
    exit /b 1
)

set VBS_PATH=%SCRIPT_DIR%silent-start.vbs
set TASK_NAME=AudiobookshelfServer

echo [INFO] Script path: %VBS_PATH%
echo [INFO] Task name: %TASK_NAME%
echo.
echo [INFO] Script path: %VBS_PATH% >> "%LOG_FILE%"
echo [INFO] Task name: %TASK_NAME% >> "%LOG_FILE%"

:: Delete existing task if exists
echo [INFO] Removing existing task if any...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Create the scheduled task
:: - Runs at system startup
:: - Runs whether user is logged on or not
:: - Runs with highest privileges
:: - Delay start by 30 seconds to ensure network is ready

echo [INFO] Creating scheduled task...
echo [INFO] Creating scheduled task... >> "%LOG_FILE%"

schtasks /create ^
    /tn "%TASK_NAME%" ^
    /tr "wscript.exe \"%VBS_PATH%\"" ^
    /sc onstart ^
    /delay 0000:30 ^
    /ru SYSTEM ^
    /rl highest ^
    /f >> "%LOG_FILE%" 2>&1

if %ERRORLEVEL% equ 0 (
    echo.
    echo [OK] Task created successfully!
    echo [OK] Task created successfully! >> "%LOG_FILE%"
    echo.
    echo The server will now automatically start when Windows boots.
    echo.
    echo To manage this task:
    echo   - Open Task Scheduler (taskschd.msc)
    echo   - Find task: %TASK_NAME%
    echo.
    echo To remove auto-start, run: remove-autostart.bat
) else (
    echo [ERROR] Failed to create scheduled task
    echo [ERROR] Failed to create scheduled task >> "%LOG_FILE%"
    echo Check log file: %LOG_FILE%
)

echo.
pause
