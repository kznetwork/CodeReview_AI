@echo off
title Digit Recognizer Launcher
echo Starting Handwritten Digit Recognizer...
cd /d "%~dp0"
python app.py
if %errorlevel% neq 0 (
    echo.
    echo [Error] The application failed to start.
    echo Please make sure Python and the required libraries (gradio, torch, etc.) are installed.
    pause
)
pause
