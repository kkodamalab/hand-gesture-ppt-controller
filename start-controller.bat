@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 bridge\controller.py %*
) else (
  python bridge\controller.py %*
)
pause
