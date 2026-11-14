@echo off
setlocal
set "project=%~1"
if not defined project set /p "project=Project directory (Enter for current directory): "
if not defined project set "project=%CD%"
pushd "%project%" || exit /b 1
where py.exe >nul 2>&1
if errorlevel 1 (
    python -B "%~dp0tools\singularity.py" serve --open
) else (
    py -3 -B "%~dp0tools\singularity.py" serve --open
)
set "result=%errorlevel%"
popd
if not "%result%"=="0" pause
exit /b %result%
