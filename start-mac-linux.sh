#!/usr/bin/env bash
# Starts the On The Way Logistics server (website + admin panel + applications API).
cd "$(dirname "$0")/backend" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org and run this again."
  exit 1
fi

[ -f .env ] || cp .env.example .env

# Install packages the first time, and again whenever package.json changes.
if ! cmp -s package.json node_modules/.installed-package.json 2>/dev/null; then
  echo "Installing required packages, please wait..."
  npm install --no-audit --no-fund || { echo "Package install failed. Check your internet connection."; exit 1; }
  cp package.json node_modules/.installed-package.json
fi

echo
echo "  Website:      http://localhost:8080/"
echo "  Admin panel:  http://localhost:8080/dashboard/"
echo "  Vendor portal: http://localhost:8080/vendor/"
echo "  Franchise portal: http://localhost:8080/franchise/"
echo
echo "  Keep this window open. Closing it stops the server."
echo
( sleep 2; (command -v open >/dev/null && open http://localhost:8080/) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8080/) ) >/dev/null 2>&1 &
npm start
