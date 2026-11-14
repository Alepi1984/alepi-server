@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo ALEPI Business - Migracion BD Bloque 3B
echo ==============================================
echo.
set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
if not exist "%PSQL%" (
  echo [ERROR] No se encontro psql.exe en PostgreSQL 18.
  echo Ajusta la ruta dentro de este BAT si tu version es distinta.
  pause
  exit /b 1
)
"%PSQL%" -U postgres -d alepi_business_dev -f "sql\002_sync_core.sql"
if errorlevel 1 (
  echo.
  echo [ERROR] La migracion no termino correctamente.
  pause
  exit /b 1
)
echo.
echo [OK] Bloque 3B aplicado en PostgreSQL.
pause
