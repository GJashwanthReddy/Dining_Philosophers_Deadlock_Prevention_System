@echo off
echo =================================================================
echo   Starting OCTO_OSSP Dining Philosophers Simulation Suite
echo =================================================================

echo [1/3] Compiling C Simulation Engine via WSL...
wsl -e bash -c "cd '$(wslpath -u \"%CD%\")' && make -C c-engine clean && make -C c-engine"

echo [2/3] Checking Node.js dependencies...
if not exist "server\node_modules\" (
    echo Installing server dependencies...
    cd server && npm install && cd ..
)

echo [3/3] Launching Node.js Communication Server & Dashboard...
echo Dashboard will be available at: http://localhost:3000
node server\server.js
pause
