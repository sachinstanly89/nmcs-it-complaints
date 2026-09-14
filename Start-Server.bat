@echo off
title Nirmala Matha Central School - IT Complaint Register
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Server.ps1"
pause
