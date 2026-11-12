@echo off
rem Startet Sorell lokal auf diesem PC - auch ohne GitHub und ohne Internet.
rem Doppelklick genuegt. Beenden: dieses Fenster schliessen.
cd /d "%~dp0"
title Sorell
set PORT=8000

rem 1) Neuere Version von GitHub holen (nur wenn Git und Internet da sind)
where git >nul 2>&1
if errorlevel 1 goto start
if not exist ".git" goto start
echo Pruefe, ob es auf GitHub eine neuere Version gibt ...
git fetch --quiet origin >nul 2>&1
if errorlevel 1 (
  echo   GitHub nicht erreichbar - starte mit dem Stand auf diesem PC.
  goto start
)
for /f %%n in ('git rev-list --count HEAD..origin/main 2^>nul') do set BEHIND=%%n
for /f %%n in ('git rev-list --count origin/main..HEAD 2^>nul') do set AHEAD=%%n
if "%BEHIND%"=="0" (
  if "%AHEAD%"=="0" (echo   Alles aktuell.) else (echo   Hinweis: %AHEAD% Aenderung^(en^) auf diesem PC sind noch nicht auf GitHub.)
  goto start
)
echo   %BEHIND% neuere Aenderung^(en^) gefunden - wird geholt ...
git pull --ff-only --quiet origin main
if errorlevel 1 (
  echo   Konnte nicht automatisch aktualisieren ^(Aenderungen auf beiden Geraeten^).
  echo   Starte trotzdem mit dem Stand auf diesem PC.
) else (
  echo   Aktualisiert.
)

:start
echo.
rem 2) Browser oeffnen (kurz verzoegert, damit der Server schon laeuft)
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%"

rem 3) Server starten: Python, wenn vorhanden, sonst PowerShell
python --version >nul 2>&1
if not errorlevel 1 (
  python serve.py %PORT%
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" %PORT%
)
pause
