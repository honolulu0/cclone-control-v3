@echo off
setlocal
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
set NO_PROXY=localhost,127.0.0.1

set ROOT=%~dp0..

start "cclone" cmd /k "cd /d %ROOT%\cclone && npm start"
start "cclone-control-v2" cmd /k "cd /d %ROOT%\cclone-control-v2 && node backend\server.cjs"
