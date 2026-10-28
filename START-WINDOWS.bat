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

rem Install packages the first time, and again whenever package.json changes (new features may need new packages).
fc /b "package.json" "node_modules\.installed-package.json" >nul 2>nul
if not errorlevel 1 goto packages_ok
echo Installing required packages, please wait...
call npm install --no-audit --no-fund
if errorlevel 1 goto install_failed
copy /y "package.json" "node_modules\.installed-package.json" >nul
goto packages_ok

:install_failed
echo.
echo  Package install failed. Check your internet connection and try again.
pause
exit /b 1

:packages_ok

echo.
echo  Website:      http://localhost:8080/
echo  Admin panel:  http://localhost:8080/dashboard/
echo  Vendor portal: http://localhost:8080/vendor/
echo  Franchise portal: http://localhost:8080/franchise/
echo.
echo  Keep this window open. Closing it stops the server and new applications will not be received.
echo.
start "" "http://localhost:8080/"
call npm start
pause
