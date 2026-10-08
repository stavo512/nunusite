@echo off
rem double-click me to rescan the media folders and update the site
cd /d "%~dp0"
where py >/dev/null 2>nul
if %errorlevel%==0 (
  py update-media.py
) else (
  python update-media.py
)
echo.
pause
