@echo off
setlocal enabledelayedexpansion

:: Get script directory for logging
set SCRIPT_DIR=%~dp0
set LOG_FILE=%SCRIPT_DIR%install.log

:: Start logging
echo ============================================ > "%LOG_FILE%"
echo   Installation Log - %date% %time% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

:: Also show in console
echo ============================================
echo   Audiobook Platform - Install and Start
echo ============================================
echo.
echo [INFO] Logging to: %LOG_FILE%
echo.

call :log "Starting installation..."

:: ============================================
:: Check Prerequisites
:: ============================================

:: Check for Node.js
call :log "[CHECK] Checking for Node.js..."
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    call :log "[ERROR] Node.js is not installed!"
    call :log ""
    call :log "Please install Node.js manually:"
    call :log "  1. Go to https://nodejs.org/"
    call :log "  2. Download the LTS version"
    call :log "  3. Run the installer"
    call :log "  4. Restart this script after installation"
    call :log ""
    start https://nodejs.org/
    goto :error_exit
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
call :log "[OK] Node.js is installed: %NODE_VERSION%"

:: Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    call :log "[ERROR] npm is not found! Please reinstall Node.js."
    goto :error_exit
)

:: ============================================
:: Check for PostgreSQL
:: ============================================
echo.
call :log "[CHECK] Checking for PostgreSQL..."

:: Check if psql is in PATH
where psql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    :: Check common PostgreSQL installation paths
    set PG_FOUND=0

    for %%V in (17 16 15 14 13 12) do (
        if exist "%ProgramFiles%\PostgreSQL\%%V\bin\psql.exe" (
            set "PATH=%ProgramFiles%\PostgreSQL\%%V\bin;%PATH%"
            set PG_FOUND=1
            set PG_VERSION=%%V
            goto :pg_found
        )
    )

    if !PG_FOUND!==0 (
        call :log "[ERROR] PostgreSQL is not installed!"
        call :log ""
        call :log "Please install PostgreSQL manually:"
        call :log "  1. Go to https://www.postgresql.org/download/windows/"
        call :log "  2. Download PostgreSQL 14 or higher"
        call :log "  3. Run the installer"
        call :log "  4. IMPORTANT: Remember the password you set for 'postgres' user"
        call :log "  5. Keep the default port 5432"
        call :log "  6. Restart this script after installation"
        call :log ""
        start https://www.postgresql.org/download/windows/
        goto :error_exit
    )
)

:pg_found
if defined PG_VERSION (
    call :log "[OK] PostgreSQL found: Version %PG_VERSION%"
) else (
    call :log "[OK] PostgreSQL is installed and in PATH"
)

:: ============================================
:: Check if PostgreSQL service is running
:: ============================================
echo.
call :log "[CHECK] Checking if PostgreSQL service is running..."

pg_isready >nul 2>nul
if %ERRORLEVEL% neq 0 (
    call :log "[INFO] PostgreSQL service may not be running. Attempting to start..."

    :: Try to start PostgreSQL service
    net start postgresql-x64-17 >nul 2>nul
    if !ERRORLEVEL! neq 0 (
        net start postgresql-x64-16 >nul 2>nul
        if !ERRORLEVEL! neq 0 (
            net start postgresql-x64-15 >nul 2>nul
            if !ERRORLEVEL! neq 0 (
                net start postgresql-x64-14 >nul 2>nul
                if !ERRORLEVEL! neq 0 (
                    net start postgresql >nul 2>nul
                )
            )
        )
    )

    :: Wait a moment for service to start
    timeout /t 3 /nobreak >nul

    :: Check again
    pg_isready >nul 2>nul
    if !ERRORLEVEL! neq 0 (
        call :log "[WARNING] Could not start PostgreSQL service automatically."
        call :log "[WARNING] Please start PostgreSQL service manually:"
        call :log "          1. Press Win+R, type 'services.msc', press Enter"
        call :log "          2. Find 'postgresql' service"
        call :log "          3. Right-click and select 'Start'"
        call :log ""
        call :log "[INFO] After starting PostgreSQL, run this script again."
        goto :error_exit
    )
)
call :log "[OK] PostgreSQL service is running"

:: ============================================
:: Create Database if not exists
:: ============================================
echo.
call :log "[CHECK] Checking for audiobookshelf database..."

:: Try to create database (will fail silently if exists)
psql -U postgres -c "CREATE DATABASE audiobookshelf;" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    call :log "[OK] Database 'audiobookshelf' created"
) else (
    call :log "[OK] Database 'audiobookshelf' already exists or will be created later"
)

:: Get project root
set PROJECT_ROOT=%SCRIPT_DIR%..

:: Navigate to project root
cd /d "%PROJECT_ROOT%"
echo.
call :log "[INFO] Project root: %CD%"

:: ============================================
:: Backend Setup
:: ============================================
echo.
call :log "[STEP 1/6] Installing backend dependencies..."
cd backend
call npm install >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% neq 0 (
    call :log "[ERROR] Failed to install backend dependencies"
    call :log "[ERROR] Check the log file for details: %LOG_FILE%"
    goto :error_exit
)
call :log "[OK] Backend dependencies installed"

:: Create .env file if not exists
if not exist ".env" (
    call :log "[STEP 2/6] Creating backend .env file..."
    (
        echo # Database
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/audiobookshelf
        echo.
        echo # JWT
        echo JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
        echo JWT_ACCESS_EXPIRY=1d
        echo JWT_REFRESH_EXPIRY_DAYS=180
        echo.
        echo # Server
        echo PORT=8081
        echo NODE_ENV=development
        echo.
        echo # Storage - using local storage
        echo USE_LOCAL_STORAGE=true
        echo LOCAL_STORAGE_PATH=./storage
    ) > .env
    call :log "[OK] Backend .env file created"
    echo.
    call :log "[IMPORTANT] If your PostgreSQL password is not 'postgres',"
    call :log "[IMPORTANT] please edit backend\.env and update DATABASE_URL"
    echo.
) else (
    call :log "[STEP 2/6] Backend .env file already exists, skipping..."
)

:: Build backend
call :log "[STEP 3/6] Building backend..."
call npm run build >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% neq 0 (
    call :log "[ERROR] Failed to build backend"
    call :log "[ERROR] Check the log file for details: %LOG_FILE%"
    goto :error_exit
)
call :log "[OK] Backend built successfully"

:: Run database migration
call :log "[STEP 4/6] Running database migration..."
call npm run reset-db >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% neq 0 (
    call :log "[WARNING] Database migration failed."
    call :log "[WARNING] Common causes:"
    call :log "          - PostgreSQL password in .env is incorrect"
    call :log "          - PostgreSQL service is not running"
    call :log "[WARNING] Please check backend\.env and try again."
) else (
    call :log "[OK] Database migrated successfully"
)

:: Create default admin account
call :log "[STEP 5/6] Creating default admin account..."
call npm run create-admin -- --email admin@test.com --password admin >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% neq 0 (
    call :log "[WARNING] Failed to create admin account. It may already exist."
) else (
    call :log "[OK] Admin account created (admin@test.com / admin)"
)

cd ..

:: ============================================
:: Frontend Setup
:: ============================================
echo.
call :log "[STEP 6/6] Installing frontend dependencies..."
cd frontend
call npm install >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% neq 0 (
    call :log "[ERROR] Failed to install frontend dependencies"
    call :log "[ERROR] Check the log file for details: %LOG_FILE%"
    goto :error_exit
)
call :log "[OK] Frontend dependencies installed"

:: Update frontend .env for port 8081
if not exist ".env" (
    (
        echo VITE_API_URL=http://localhost:8081/api
    ) > .env
    call :log "[OK] Frontend .env file created"
)

:: Build frontend
call :log "[INFO] Building frontend for production..."
call npm run build >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% neq 0 (
    call :log "[ERROR] Failed to build frontend"
    call :log "[ERROR] Check the log file for details: %LOG_FILE%"
    goto :error_exit
)
call :log "[OK] Frontend built successfully"

cd ..

:: ============================================
:: Start Server
:: ============================================
echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
call :log "[INFO] Admin credentials:"
call :log "       Email: admin@test.com"
call :log "       Password: admin"
echo.
call :log "[INFO] Server will be available at:"
call :log "       http://localhost:8081"
echo.
call :log "[INFO] Press Ctrl+C to stop the server"
echo.
echo ============================================
echo   Starting Server on port 8081
echo ============================================
echo.

cd backend
call npm run dev
goto :end

:: ============================================
:: Error exit
:: ============================================
:error_exit
echo.
echo ============================================
echo   Installation Failed
echo ============================================
echo.
echo Check the log file for details: %LOG_FILE%
echo.
pause
exit /b 1

:: ============================================
:: Logging function
:: ============================================
:log
echo %~1
echo %~1 >> "%LOG_FILE%"
goto :eof

:end
echo.
echo [INFO] Server stopped.
echo.
pause
