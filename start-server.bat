@echo off
setlocal

echo ======================================
echo       instaJOY Server Startup
echo ======================================
echo.

if not exist ".env" if not exist "backend\.env" (
    echo ERROR: No environment file found.
    echo.
    echo Create either:
    echo   .env
    echo or
    echo   backend\.env
    echo.
    echo You can copy .env.example and fill in your values.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing project dependencies...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo.
echo Starting server...
echo.

call npm run dev

pause
