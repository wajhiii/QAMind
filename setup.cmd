@echo off
rem QAMind setup: installs QAMind for your coding tools from this checkout. See: setup.cmd --help
where node >nul 2>nul
if errorlevel 1 (
  echo QAMind setup needs Node 22.18 or newer, and node was not found. Install it from https://nodejs.org and run setup.cmd again. 1>&2
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split(\".\").map(Number); if (a<22||(a===22&&b<18)) { console.error(\"QAMind setup needs Node 22.18 or newer (this is \"+process.version+\").\"); process.exit(1) }"
if errorlevel 1 exit /b 1
set "QAMIND_CALLER_DIR=%CD%"
node --disable-warning=ExperimentalWarning "%~dp0cli\src\setup-main.ts" setup %*
