@echo off
cd /d "%~dp0"
echo === ALEPI Business API ===
if not exist .env (
  echo ERROR: falta server\.env
  echo Copia .env.example como .env y configura DATABASE_URL.
  pause
  exit /b 1
)
npm start
