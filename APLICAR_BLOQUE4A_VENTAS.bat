@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo ERROR: falta server\.env
  echo Copia .env.example como .env y configura DATABASE_URL.
  pause
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  if /i "%%A"=="DATABASE_URL" set "ALEPI_DATABASE_URL=%%B"
)

if not defined ALEPI_DATABASE_URL (
  echo ERROR: DATABASE_URL no esta configurada en server\.env
  pause
  exit /b 1
)

psql "%ALEPI_DATABASE_URL%" -v ON_ERROR_STOP=1 -f "%~dp0sql\005_sales_inventory.sql"
if errorlevel 1 (
  echo.
  echo ERROR: no se pudo aplicar Bloque 4A.
  pause
  exit /b 1
)

echo.
echo [OK] PostgreSQL actualizado para ventas e inventario.
pause
