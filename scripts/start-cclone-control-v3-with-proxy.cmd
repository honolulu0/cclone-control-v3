@echo off
setlocal

set "HTTP_PROXY="
set "HTTPS_PROXY="
set "NO_PROXY=localhost,127.0.0.1"
set "CCLONE_CONTROL_V3_PORT=8797"
set "CCLONE_CONTROL_V3_API_ORIGIN=http://127.0.0.1:%CCLONE_CONTROL_V3_PORT%"

for %%I in ("%~dp0..\cclone-control-v3") do set "APP_ROOT=%%~fI"

if /i "%~1"=="prod" (
  cd /d "%APP_ROOT%"
  call npm start
  exit /b %errorlevel%
)

echo Starting cclone-control-v3 in dev mode with HMR...
echo Frontend: http://127.0.0.1:5177
echo Backend API: %CCLONE_CONTROL_V3_API_ORIGIN%
echo External proxy: disabled
echo Use "%~nx0 prod" for the built backend/dist server.

start "cclone-control-v3 backend" cmd /k "setlocal && set ""HTTP_PROXY=%HTTP_PROXY%"" && set ""HTTPS_PROXY=%HTTPS_PROXY%"" && set ""NO_PROXY=%NO_PROXY%"" && set ""CCLONE_CONTROL_V3_PORT=%CCLONE_CONTROL_V3_PORT%"" && cd /d ""%APP_ROOT%"" && npm run dev:backend"
start "cclone-control-v3 frontend" cmd /k "setlocal && set ""HTTP_PROXY=%HTTP_PROXY%"" && set ""HTTPS_PROXY=%HTTPS_PROXY%"" && set ""NO_PROXY=%NO_PROXY%"" && set ""CCLONE_CONTROL_V3_API_ORIGIN=%CCLONE_CONTROL_V3_API_ORIGIN%"" && cd /d ""%APP_ROOT%"" && npm run dev:frontend"
