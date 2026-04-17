@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SUCCESS_COUNT=0"
set "FAIL_COUNT=0"

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] git not found in PATH.
  exit /b 1
)

echo ==================================================
echo Push Axios Fix Commits To GitLab
echo ==================================================
echo.

call :push_repo "D:\HBuilderProjects\key_parts_web" "master"
call :push_repo "D:\HBuilderProjects\wjsc-frontend" "master"
call :push_repo "D:\niuma\costoutdashboardvue" "main"
call :push_repo "D:\niuma\fastapi-backend-mybase" "master"

echo.
echo ==================================================
echo Summary
echo ==================================================
echo Success: %SUCCESS_COUNT%
echo Failed : %FAIL_COUNT%
echo.

if not "%FAIL_COUNT%"=="0" (
  echo One or more pushes failed.
  exit /b 1
)

echo All pushes completed successfully.
exit /b 0

:push_repo
set "REPO=%~1"
set "BRANCH=%~2"
set "HEAD_SHA="
set "REMOTE_URL="

echo --------------------------------------------------
echo Repo   : %REPO%
echo Branch : %BRANCH%

for /f "usebackq delims=" %%I in (`git -C "%REPO%" rev-parse --short HEAD 2^>nul`) do set "HEAD_SHA=%%I"
for /f "usebackq delims=" %%I in (`git -C "%REPO%" remote get-url origin 2^>nul`) do set "REMOTE_URL=%%I"

if not defined HEAD_SHA (
  echo [ERROR] Unable to resolve HEAD for %REPO%.
  set /a FAIL_COUNT+=1
  echo.
  goto :eof
)

echo Commit : %HEAD_SHA%
if defined REMOTE_URL echo Remote : %REMOTE_URL%

git -C "%REPO%" push origin "%BRANCH%"
if errorlevel 1 (
  echo [FAILED] push failed for %REPO%
  set /a FAIL_COUNT+=1
  echo.
  goto :eof
)

echo [OK] push succeeded for %REPO%
set /a SUCCESS_COUNT+=1
echo.
goto :eof
