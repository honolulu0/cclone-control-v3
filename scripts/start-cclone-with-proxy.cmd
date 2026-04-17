@echo off
setlocal
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
set NO_PROXY=localhost,127.0.0.1

cd /d "%~dp0..\cclone"
call npm start
