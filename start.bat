@echo off
setlocal
cd /d "%~dp0"

echo Starting USED PRODUCTS Price Index...
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not available on PATH.
  echo Install Node.js 18 or newer, then try again.
  pause
  exit /b 1
)

node --version
if errorlevel 1 (
  echo ERROR: Could not start Node.js.
  pause
  exit /b 1
)

rem Avoid launching a second server when port 3000 is already occupied.
powershell -NoProfile -Command "try { $client = New-Object System.Net.Sockets.TcpClient; $client.Connect('127.0.0.1', 3000); $client.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo Port 3000 is already in use. The app may already be running.
  echo Open http://localhost:3000 in your browser.
  exit /b 0
)

echo.
echo App URL: http://localhost:3000
echo Keep this window open while using the app. Press Ctrl+C to stop.
echo.
call npm start
if errorlevel 1 (
  echo.
  echo The app stopped with an error.
  pause
  exit /b 1
)
endlocal
