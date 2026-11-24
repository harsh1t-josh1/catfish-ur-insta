@echo off
echo ===================================================
echo   Starting AI Pose Studio Mobile Application (Expo)
echo ===================================================
cd /d "%~dp0mobile"
set EXPO_NO_TELEMETRY=true
npx.cmd expo start
pause
