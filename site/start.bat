@echo off
rem Serves the repo folder to this computer only (127.0.0.1), then opens the players' site.
rem Port 8767 keeps it from clashing with the GM prep site on 8766. Close this window to stop.
start "" http://127.0.0.1:8767/
python -m http.server 8767 --bind 127.0.0.1 --directory "%~dp0.."
