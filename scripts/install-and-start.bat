@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Audiobook Platform - Install and Start
echo ============================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Get Node version
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [INFO] Node.js version: %NODE_VERSION%

:: Get script directory and project root
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..

:: Navigate to project root
cd /d "%PROJECT_ROOT%"
echo [INFO] Project root: %CD%

:: ============================================
:: Backend Setup
:: ============================================
echo.
echo [STEP 1/6] Installing backend dependencies...
cd backend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install backend dependencies
    pause
    exit /b 1
)
echo [OK] Backend dependencies installed

:: Create .env file if not exists
if not exist ".env" (
    echo [STEP 2/6] Creating backend .env file...
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
    echo [OK] Backend .env file created
) else (
    echo [STEP 2/6] Backend .env file already exists, skipping...
)

:: Build backend
echo [STEP 3/6] Building backend...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to build backend
    pause
    exit /b 1
)
echo [OK] Backend built successfully

:: Run database migration
echo [STEP 4/6] Running database migration...
call npm run reset-db
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Database migration failed. Make sure PostgreSQL is running.
    echo [WARNING] You may need to run 'npm run reset-db' manually later.
) else (
    echo [OK] Database migrated successfully
)

:: Create default admin account
echo [STEP 5/6] Creating default admin account...
call npm run create-admin -- --email admin@test.com --password admin
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Failed to create admin account. It may already exist.
) else (
    echo [OK] Admin account created (admin@test.com / admin)
)

cd ..

:: ============================================
:: Frontend Setup
:: ============================================
echo.
echo [STEP 6/6] Installing frontend dependencies...
cd frontend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install frontend dependencies
    pause
    exit /b 1
)
echo [OK] Frontend dependencies installed

:: Update frontend .env for port 8081
if not exist ".env" (
    (
        echo VITE_API_URL=http://localhost:8081/api
    ) > .env
    echo [OK] Frontend .env file created
)

:: Build frontend
echo [INFO] Building frontend for production...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to build frontend
    pause
    exit /b 1
)
echo [OK] Frontend built successfully

cd ..

:: ============================================
:: Start Server
:: ============================================
echo.
echo ============================================
echo   Starting Server on port 8081
echo ============================================
echo.
echo [INFO] Admin credentials:
echo        Email: admin@test.com
echo        Password: admin
echo.
echo [INFO] Server will be available at:
echo        http://localhost:8081
echo.
echo [INFO] Press Ctrl+C to stop the server
echo.

cd backend
call npm run dev

pause
