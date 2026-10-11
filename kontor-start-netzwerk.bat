@echo off
rem Startet Kontor fuer das ganze Netzwerk (Tablets, weitere Kassen).
rem Fragt nach Administratorrechten (noetig fuer Netzwerkfreigabe und Firewall-Regel).
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0server\kontor-server.ps1\"','-Lan'"
