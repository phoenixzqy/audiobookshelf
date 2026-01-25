@echo off
setlocal enabledelayedexpansion
:: ===========================================
:: Audiobook Platform - Apply Database Patches
:: For Windows
:: ===========================================

set SCRIPT_DIR=%~dp0
set BACKEND_ROOT=%SCRIPT_DIR%..\..
set PATCHES_DIR=%SCRIPT_DIR%patches
set ENV_FILE=%BACKEND_ROOT%\.env

echo ============================================
echo   Audiobook Platform - Apply DB Patches
echo ============================================
echo.

:: Check if .env file exists
if not exist "%ENV_FILE%" (
    echo [ERROR] .env file not found at: %ENV_FILE%
    echo Please create a .env file with DATABASE_URL configured.
    pause
    exit /b 1
)

:: Read DATABASE_URL from .env file
set DATABASE_URL=
for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do (
    set "line=%%a"
    if "!line!"=="DATABASE_URL" set "DATABASE_URL=%%b"
)

if "%DATABASE_URL%"=="" (
    echo [ERROR] DATABASE_URL not found in .env file
    pause
    exit /b 1
)

echo [OK] Found DATABASE_URL in .env

:: Check if psql is available
where psql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] psql command not found.
    echo.
    echo Please install PostgreSQL and add it to your PATH:
    echo   1. Download from: https://www.postgresql.org/download/windows/
    echo   2. During installation, select "Command Line Tools"
    echo   3. Add PostgreSQL bin directory to PATH, typically:
    echo      C:\Program Files\PostgreSQL\16\bin
    echo.
    pause
    exit /b 1
)

echo [OK] PostgreSQL client found
echo.

:: Check if patches directory exists
if not exist "%PATCHES_DIR%" (
    echo [WARN] No patches directory found at: %PATCHES_DIR%
    echo Nothing to apply.
    pause
    exit /b 0
)

:: Count patch files
set TOTAL_PATCHES=0
for %%f in ("%PATCHES_DIR%\*.sql") do set /a TOTAL_PATCHES+=1

if %TOTAL_PATCHES%==0 (
    echo [INFO] No patch files found in: %PATCHES_DIR%
    pause
    exit /b 0
)

echo [INFO] Found %TOTAL_PATCHES% patch file(s) to apply
echo.

:: Check if specific patch was provided
set SPECIFIC_PATCH=%~1
if not "%SPECIFIC_PATCH%"=="" (
    if exist "%PATCHES_DIR%\%SPECIFIC_PATCH%" (
        echo [INFO] Applying specific patch: %SPECIFIC_PATCH%
        echo.
        goto :apply_single
    ) else (
        echo [ERROR] Patch file not found: %PATCHES_DIR%\%SPECIFIC_PATCH%
        pause
        exit /b 1
    )
)

:: Apply all patches
set APPLIED=0
set FAILED=0

for %%f in ("%PATCHES_DIR%\*.sql") do (
    echo [APPLYING] %%~nxf...

    psql "%DATABASE_URL%" -f "%%f"
    if !ERRORLEVEL! equ 0 (
        echo [OK] Applied: %%~nxf
        set /a APPLIED+=1
    ) else (
        echo [FAILED] Failed to apply: %%~nxf
        set /a FAILED+=1
    )
    echo.
)

goto :summary

:apply_single
set APPLIED=0
set FAILED=0
echo [APPLYING] %SPECIFIC_PATCH%...
psql "%DATABASE_URL%" -f "%PATCHES_DIR%\%SPECIFIC_PATCH%"
if %ERRORLEVEL% equ 0 (
    echo [OK] Applied: %SPECIFIC_PATCH%
    set /a APPLIED+=1
) else (
    echo [FAILED] Failed to apply: %SPECIFIC_PATCH%
    set /a FAILED+=1
)
echo.

:summary
echo ============================================
echo Summary:
echo   Applied: %APPLIED%
echo   Failed:  %FAILED%
echo ============================================

if %FAILED% gtr 0 (
    echo [WARN] Some patches failed. Review the errors above.
    pause
    exit /b 1
)

echo [SUCCESS] All patches applied successfully!
echo.
pause
