@echo off
rem Renders-demo server (port 3005): a lightweight watcher that keeps `node server/index.js` alive for the
-- render demo / device previews. Settings: PORT comes from the environment or defaults to 3005.
rem Registered as a scheduled task by: schtasks /create /tn "StrongholdDemoServer" /tr <this file> /sc onstart
setlocal EnableExtensions
cd /d "%~dp0.."
set "PORT=3005"
set "HOST=0.0.0.0"
:loop
node server/index.js >> logs\demo-server.log 2>&1
rem crash/exit: restart after 5 s (the window closes only if the task is ended)
timeout /t 5 /nobreak >nul
goto loop
