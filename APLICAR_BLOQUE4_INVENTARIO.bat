@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo =====================================================
echo ALEPI Business - Bloque 4 Productos e Inventario
echo =====================================================
echo.
set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
if not exist "%PSQL%" (
  echo [ERROR] No se encontro psql.exe en PostgreSQL 18.
  pause
  exit /b 1
)
"%PSQL%" -v ON_ERROR_STOP=1 -U postgres -d alepi_business_dev -f "sql\004_inventory_core.sql"
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo aplicar el Bloque 4.
  pause
  exit /b 1
)
echo.
echo [OK] Bloque 4 Productos e Inventario aplicado en PostgreSQL.
pause
