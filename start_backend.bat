@echo off
echo ===================================================
echo   Starting AI Pose Reference & Photo Recreation Backend
echo ===================================================
cd /d "%~dp0backend"
set "MODELS_DIR=%~dp0backend\models"
set "U2NET_HOME=%~dp0backend\models"
echo Using Python virtual environment: %~dp0backend\.venv
"%~dp0backend\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
