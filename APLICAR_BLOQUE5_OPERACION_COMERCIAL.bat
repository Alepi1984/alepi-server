@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo =====================================================
echo ALEPI Business - PostgreSQL Bloque 5
echo Caja, clientes, fiado, compras y reportes
echo =====================================================
echo.

if not exist ".env" (
  echo [ERROR] Falta server\.env
  echo El archivo debe contener DATABASE_URL.
  pause
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  if /i "%%A"=="DATABASE_URL" set "ALEPI_DATABASE_URL=%%B"
)

if not defined ALEPI_DATABASE_URL (
  echo [ERROR] DATABASE_URL no esta configurada en server\.env
  pause
  exit /b 1
)
set "ALEPI_DATABASE_URL=%ALEPI_DATABASE_URL:"=%"

set "PSQL_CMD=psql"
where psql >nul 2>&1
if errorlevel 1 set "PSQL_CMD=C:\Program Files\PostgreSQL\18\bin\psql.exe"

if not exist "%PSQL_CMD%" if /i not "%PSQL_CMD%"=="psql" (
  echo [ERROR] No se encontro psql de PostgreSQL 18.
  pause
  exit /b 1
)

"%PSQL_CMD%" "%ALEPI_DATABASE_URL%" -v ON_ERROR_STOP=1 -f "%~dp0sql\006_commercial_operations.sql"
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo aplicar el Bloque 5 en PostgreSQL.
  echo No inicies la app nueva hasta corregir este punto.
  pause
  exit /b 1
)

echo.
echo [OK] PostgreSQL actualizado al esquema comercial 6.
echo [OK] Los datos anteriores fueron conservados.
pause
