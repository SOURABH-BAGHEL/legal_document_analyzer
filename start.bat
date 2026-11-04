@echo off
rem Starts the AI-Powered Legal Document Analyzer: installs anything missing on the
rem first run, opens the backend and frontend in their own windows, then the browser.
rem Close those two windows (or press Ctrl+C in them) to stop the app.

setlocal
title Legal Document Analyzer - Launcher
cd /d "%~dp0"

set "BACKEND_PORT=8000"
set "FRONTEND_PORT=5173"
set "VENV_PY=backend\.venv\Scripts\python.exe"
set "APP_URL=http://localhost:%FRONTEND_PORT%"

echo.
echo  AI-Powered Legal Document Analyzer
echo  ----------------------------------
echo.

rem --- Prerequisites ----------------------------------------------------------
where node >nul 2>nul || goto :no_node
where npm >nul 2>nul || goto :no_node

rem --- Backend dependencies ---------------------------------------------------
if exist "%VENV_PY%" goto :venv_ready
where python >nul 2>nul || goto :no_python
python -c "import sys; sys.exit(sys.version_info < (3, 11))" || goto :no_python
echo  Creating Python virtual environment...
python -m venv backend\.venv || goto :setup_failed

:venv_ready
"%VENV_PY%" -c "import fastapi, uvicorn, sqlalchemy, pymupdf, docx, httpx, multipart" >nul 2>nul && goto :backend_ready
echo  Installing backend dependencies, this can take a few minutes...
"%VENV_PY%" -m pip install -r backend\requirements.txt || goto :setup_failed

:backend_ready
rem --- Frontend dependencies --------------------------------------------------
if exist "frontend\node_modules\.bin\vite.cmd" goto :frontend_ready
echo  Installing frontend dependencies, this can take a few minutes...
pushd frontend
call npm install
set "NPM_RESULT=%errorlevel%"
popd
if not "%NPM_RESULT%"=="0" goto :setup_failed

:frontend_ready
rem --- Start servers (skipped if the port is already serving) -----------------
netstat -ano | findstr /r /c:":%BACKEND_PORT% .*LISTENING" >nul && goto :backend_running
echo  Starting backend on port %BACKEND_PORT%...
start "Legal Analyzer - Backend" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port %BACKEND_PORT%"
goto :start_frontend

:backend_running
echo  Backend is already running on port %BACKEND_PORT%.

:start_frontend
netstat -ano | findstr /r /c:":%FRONTEND_PORT% .*LISTENING" >nul && goto :frontend_running
echo  Starting frontend on port %FRONTEND_PORT%...
start "Legal Analyzer - Frontend" /D "%~dp0frontend" cmd /k "npm run dev"
goto :wait

:frontend_running
echo  Frontend is already running on port %FRONTEND_PORT%.

rem --- Wait until both respond, then open the browser -------------------------
:wait
echo  Waiting for the servers to respond...
set /a TRIES=0

:wait_backend
curl -s -o nul --max-time 2 http://127.0.0.1:%BACKEND_PORT%/api/health && goto :wait_frontend
set /a TRIES+=1
if %TRIES% geq 45 goto :not_ready
ping -n 2 127.0.0.1 >nul
goto :wait_backend

:wait_frontend
curl -s -o nul --max-time 2 %APP_URL% && goto :ready
set /a TRIES+=1
if %TRIES% geq 45 goto :not_ready
ping -n 2 127.0.0.1 >nul
goto :wait_frontend

:ready
echo.
echo  Ready.
echo    App:      %APP_URL%
echo    API docs: http://localhost:%BACKEND_PORT%/docs
echo.
echo  To stop the app, close the Backend and Frontend windows.
start "" "%APP_URL%"
exit /b 0

:not_ready
echo.
echo  The servers did not respond in time. Check the Backend and Frontend windows for errors.
pause
exit /b 1

:no_python
echo  Python 3.11 or newer was not found. Install it from https://www.python.org/downloads/
echo  and tick "Add python.exe to PATH" during setup, then run start.bat again.
pause
exit /b 1

:no_node
echo  Node.js was not found. Install the LTS version from https://nodejs.org/
echo  then run start.bat again.
pause
exit /b 1

:setup_failed
echo.
echo  Setup failed. See the messages above, fix the problem, then run start.bat again.
pause
exit /b 1
