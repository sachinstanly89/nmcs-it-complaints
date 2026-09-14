@echo off
title Nirmala Matha Central School - Publish IT Register Online
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Publish-Online.ps1"
pause
