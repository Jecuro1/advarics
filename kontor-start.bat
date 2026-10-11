@echo off
title Kontor Server
rem Startet Kontor nur fuer diesen PC: http://localhost:8080
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\kontor-server.ps1"
if errorlevel 1 pause
