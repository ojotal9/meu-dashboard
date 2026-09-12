@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto executar
where py >nul 2>nul
if not errorlevel 1 (
    py -3 -m venv .venv
) else (
    if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
        "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m venv .venv
    ) else (
        python -m venv .venv
    )
)
if errorlevel 1 goto erro
:executar
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto erro
echo.
echo Abra http://127.0.0.1:5000 no navegador.
echo Para encerrar, pressione Ctrl+C.
echo.
".venv\Scripts\python.exe" app.py %*
goto fim
:erro
echo.
echo Nao foi possivel iniciar. Instale Python 3.10 ou superior
echo e consulte as instrucoes do README.md.
pause
:fim
endlocal
