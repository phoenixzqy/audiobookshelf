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
echo [INFO] This script assumes Node.js and PostgreSQL are already installed.
echo [INFO] If not, please install them first:
echo        - Node.js: https://nodejs.org/
echo        - PostgreSQL: https://www.postgresql.org/download/windows/
echo.

call :log "Starting installation..."

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
        echo # Storage
        echo USE_LOCAL_STORAGE=true
        echo.
        echo # CORS
        echo CORS_ORIGIN=http://localhost:8081
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
