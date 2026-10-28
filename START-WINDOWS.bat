@echo off
title On The Way Logistics - Server
cd /d "%~dp0backend"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Download and install the LTS version from https://nodejs.org  then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist ".env" copy ".env.example" ".env" >nul

if not exist "node_modules" (
  echo Installing required packages - first time only, please wait...
  call npm install
  if errorlevel 1 (
    echo.
    echo  Package install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo  Website:      http://localhost:8080/
echo  Admin panel:  http://localhost:8080/dashboard/
echo.
echo  Keep this window open. Closing it stops the server and new applications will not be received.
echo.
start "" "http://localhost:8080/"
call npm start
pause
