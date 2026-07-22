@echo off
echo ====================================================
echo        Pulse Alerts System - Automatic Setup
echo ====================================================
echo.

echo [1/3] Starting Docker Infrastructure...
docker-compose -f docker-compose-pulse.yml up -d
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start Docker containers. Make sure Docker Desktop is running!
    pause
    exit /b %errorlevel%
)
echo Docker Infrastructure is up and running!
echo.

echo [2/3] Installing Frontend Dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install NPM dependencies. Make sure Node.js is installed.
    cd ..
    pause
    exit /b %errorlevel%
)
cd ..
echo Frontend dependencies installed!
echo.

echo [3/3] Installing Backend Dependencies...
go mod tidy
if %errorlevel% neq 0 (
    echo [ERROR] Failed to download Go modules. Make sure Go is installed.
    pause
    exit /b %errorlevel%
)
echo Go dependencies installed!
echo.

echo ====================================================
echo                     SETUP COMPLETE                  
echo ====================================================
echo.
echo Remember to place your Firebase Private Key in:
echo   internal/config/firebase-service-account.json
echo.
echo NOTE: Ensure you are using a VPN if Binance services/APIs are restricted in your location.
echo.
echo To run the application, open two terminals:
echo Terminal 1 (Frontend): cd frontend ^&^& npm run dev
echo Terminal 2 (Backend):  go run internal/cmd/main.go
echo.
pause
