#!/usr/bin/env bash
set -e

echo "================================================================="
echo "  Starting OCTO_OSSP Dining Philosophers Simulation Suite"
echo "================================================================="

# Compile C engine
echo "[1/3] Compiling C Engine with GCC & POSIX threads..."
make -C c-engine clean
make -C c-engine

# Run verification test
echo "[2/3] Running synchronization unit tests..."
./c-engine/bin/test_synchronization

# Check Node modules
if [ ! -d "server/node_modules" ]; then
    echo "[3/3] Installing Node.js dependencies..."
    cd server && npm install && cd ..
else
    echo "[3/3] Node.js dependencies verified."
fi

echo "Launching Communication Server and Web Dashboard..."
echo "Open http://localhost:3000 in your browser."
node server/server.js
