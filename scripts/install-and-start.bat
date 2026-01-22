@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Audiobook Platform - Install and Start
echo ============================================
echo.

:: Check for admin rights (needed for installations)
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Not running as Administrator.
    echo [WARNING] If Node.js or PostgreSQL need to be installed,
    echo [WARNING] please right-click and "Run as administrator".
    echo.
)

:: ============================================
:: Check and Install Prerequisites
:: ============================================

:: Check if winget is available (Windows Package Manager)
where winget >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Windows Package Manager (winget) not found.
    echo [WARNING] Auto-installation requires Windows 10 1709+ or Windows 11.
    echo [WARNING] Please install prerequisites manually if needed.
    echo.
    set WINGET_AVAILABLE=0
) else (
    set WINGET_AVAILABLE=1
)

:: ============================================
:: Check and Install Node.js
:: ============================================
echo [CHECK] Checking for Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] Node.js is not installed.

    if %WINGET_AVAILABLE%==1 (
        echo [INFO] Installing Node.js via winget...
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        if %ERRORLEVEL% neq 0 (
            echo [ERROR] Failed to install Node.js automatically.
            echo [ERROR] Please install Node.js manually from https://nodejs.org/
            pause
            exit /b 1
        )

        :: Refresh PATH to include newly installed Node.js
        echo [INFO] Refreshing environment variables...
        call refreshenv >nul 2>nul

        :: If refreshenv doesn't exist, try to find Node.js manually
        where node >nul 2>nul
        if %ERRORLEVEL% neq 0 (
            :: Try common installation paths
            if exist "%ProgramFiles%\nodejs\node.exe" (
                set "PATH=%ProgramFiles%\nodejs;%PATH%"
            ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
                set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
            ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
                set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
            ) else (
                echo [ERROR] Node.js was installed but not found in PATH.
                echo [ERROR] Please close this window, open a new Command Prompt, and run this script again.
                pause
                exit /b 1
            )
        )
        echo [OK] Node.js installed successfully
    ) else (
        echo [ERROR] Cannot auto-install Node.js without winget.
        echo [ERROR] Please install Node.js manually from https://nodejs.org/
        start https://nodejs.org/
        pause
        exit /b 1
    )
) else (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
    echo [OK] Node.js is installed: !NODE_VERSION!
)

:: Verify Node.js is working
node -v >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js installation verification failed.
    echo [ERROR] Please restart your computer and run this script again.
    pause
    exit /b 1
)

:: ============================================
:: Check and Install PostgreSQL
:: ============================================
echo.
echo [CHECK] Checking for PostgreSQL...

:: Check if psql is in PATH
where psql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    :: Check common PostgreSQL installation paths
    set PG_FOUND=0

    for %%V in (16 15 14 13 12) do (
        if exist "%ProgramFiles%\PostgreSQL\%%V\bin\psql.exe" (
            set "PATH=%ProgramFiles%\PostgreSQL\%%V\bin;%PATH%"
            set PG_FOUND=1
            set PG_VERSION=%%V
            goto :pg_found
        )
    )

    :pg_not_found
    if !PG_FOUND!==0 (
        echo [INFO] PostgreSQL is not installed.

        if %WINGET_AVAILABLE%==1 (
            echo [INFO] Installing PostgreSQL via winget...
            echo [INFO] You will be prompted to set a password for the 'postgres' user.
            echo [INFO] IMPORTANT: Remember this password! Default suggestion: postgres
            echo.

            winget install PostgreSQL.PostgreSQL --accept-source-agreements --accept-package-agreements
            if %ERRORLEVEL% neq 0 (
                echo [WARNING] Winget installation failed. Trying alternative method...
                goto :pg_manual_install
            )

            :: Find the installed PostgreSQL
            for %%V in (16 15 14 13 12) do (
                if exist "%ProgramFiles%\PostgreSQL\%%V\bin\psql.exe" (
                    set "PATH=%ProgramFiles%\PostgreSQL\%%V\bin;%PATH%"
                    set PG_FOUND=1
                    set PG_VERSION=%%V
                    goto :pg_installed
                )
            )

            :pg_installed
            if !PG_FOUND!==1 (
                echo [OK] PostgreSQL installed successfully
            ) else (
                echo [WARNING] PostgreSQL was installed but not found.
                echo [WARNING] You may need to restart and run this script again.
            )
        ) else (
            :pg_manual_install
            echo [INFO] Opening PostgreSQL download page...
            echo [INFO] Please download and install PostgreSQL 14 or higher.
            echo [INFO] During installation:
            echo        - Remember the password you set for 'postgres' user
            echo        - Keep the default port 5432
            echo        - Select all components
            echo.
            start https://www.postgresql.org/download/windows/
            echo [INFO] After installing PostgreSQL, run this script again.
            pause
            exit /b 1
        )
    )

    :pg_found
    if !PG_FOUND!==1 (
        echo [OK] PostgreSQL found: Version !PG_VERSION!
    )
) else (
    echo [OK] PostgreSQL is installed and in PATH
)

:: ============================================
:: Check if PostgreSQL service is running
:: ============================================
echo.
echo [CHECK] Checking if PostgreSQL service is running...

:: Try to connect to PostgreSQL
pg_isready >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] PostgreSQL service may not be running. Attempting to start...

    :: Try to start PostgreSQL service
    net start postgresql-x64-16 >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        net start postgresql-x64-15 >nul 2>nul
        if %ERRORLEVEL% neq 0 (
            net start postgresql-x64-14 >nul 2>nul
            if %ERRORLEVEL% neq 0 (
                :: Try generic service name
                net start postgresql >nul 2>nul
            )
        )
    )

    :: Wait a moment for service to start
    timeout /t 3 /nobreak >nul

    :: Check again
    pg_isready >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        echo [WARNING] Could not start PostgreSQL service automatically.
        echo [WARNING] Please start PostgreSQL service manually:
        echo           1. Press Win+R, type 'services.msc', press Enter
        echo           2. Find 'postgresql' service
        echo           3. Right-click and select 'Start'
        echo.
        echo [INFO] After starting PostgreSQL, run this script again.
        pause
        exit /b 1
    )
)
echo [OK] PostgreSQL service is running

:: ============================================
:: Create Database if not exists
:: ============================================
echo.
echo [CHECK] Checking for audiobookshelf database...

:: Try to create database (will fail silently if exists)
psql -U postgres -c "CREATE DATABASE audiobookshelf;" 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Database 'audiobookshelf' created
) else (
    echo [OK] Database 'audiobookshelf' already exists or will be created later
)

:: Get script directory and project root
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..

:: Navigate to project root
cd /d "%PROJECT_ROOT%"
echo.
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
    echo.
    echo [IMPORTANT] If your PostgreSQL password is not 'postgres',
    echo [IMPORTANT] please edit backend\.env and update DATABASE_URL
    echo.
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
    echo [WARNING] Database migration failed.
    echo [WARNING] Common causes:
    echo           - PostgreSQL password in .env is incorrect
    echo           - PostgreSQL service is not running
    echo [WARNING] Please check backend\.env and try again.
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
echo   Installation Complete!
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
echo ============================================
echo   Starting Server on port 8081
echo ============================================
echo.

cd backend
call npm run dev

pause
