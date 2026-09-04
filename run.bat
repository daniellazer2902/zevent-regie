@echo off
title ZEvent Regie - port 5080
cd /d "%~dp0"
if not exist node_modules (
  echo Premiere installation, patientez...
  call npm install --no-audit --no-fund
)
start "" http://localhost:5080
call npm run dev
