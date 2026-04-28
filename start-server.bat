@echo off
REM INSTAJOY Local Development Server
REM This script starts a local HTTP server for development

echo ====================================
echo INSTAJOY - Local Development Server
echo ====================================
echo.

cd /d "c:\Users\prana\OneDrive\Desktop\instaJOY"

echo Starting local server on http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Using Python HTTP Server...
    python -m http.server 8000
) else (
    REM Check if Node.js http-server is available
    http-server --version >nul 2>&1
    if %errorlevel% equ 0 (
        echo Using Node.js HTTP Server...
        http-server -p 8000
    ) else (
        echo ERROR: Neither Python nor Node.js http-server found!
        echo.
        echo Please install one of the following:
        echo 1. Python (https://python.org)
        echo 2. Node.js with http-server (npm install -g http-server)
        echo.
        pause
        exit /b 1
    )
)
