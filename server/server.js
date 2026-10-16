const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const apiRoutes = require('./routes/api');
const engineManager = require('./services/engine_manager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
const frontendDir = path.resolve(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

// Mount REST API
app.use('/api', apiRoutes);

// WebSocket handling
wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WebSocket] Client connected from ${ip}`);

    // Send initial complete state snapshot immediately upon connection
    const snapshot = engineManager.getSnapshot();
    ws.send(JSON.stringify(snapshot));

    // Listen for client commands via WebSocket
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('[WebSocket] Received command from client:', data);

            if (data.cmd) {
                let cmdStr = '';
                const cmd = data.cmd.toLowerCase();
                if (cmd === 'start') {
                    cmdStr = `START ${data.algorithm || engineManager.state.algorithm}`;
                } else if (cmd === 'demo_deadlock') {
                    cmdStr = 'DEMO_DEADLOCK';
                } else if (cmd === 'pause') {
                    cmdStr = 'PAUSE';
                } else if (cmd === 'resume') {
                    cmdStr = 'RESUME';
                } else if (cmd === 'stop') {
                    cmdStr = 'STOP';
                } else if (cmd === 'reset') {
                    cmdStr = 'RESET';
                } else if (cmd === 'config') {
                    cmdStr = `CONFIG ${data.thinkMin || 800} ${data.thinkMax || 1600} ${data.eatMin || 800} ${data.eatMax || 1600}`;
                } else if (cmd === 'snapshot') {
                    ws.send(JSON.stringify(engineManager.getSnapshot()));
                    return;
                } else {
                    cmdStr = data.cmd;
                }

                engineManager.sendCommand(cmdStr);
            }
        } catch (e) {
            console.error('[WebSocket] Error parsing client message:', e.message);
        }
    });

    ws.on('close', () => {
        console.log(`[WebSocket] Client disconnected (${ip})`);
    });

    ws.on('error', (err) => {
        console.error('[WebSocket] Client error:', err.message);
    });
});

// Broadcast events from C Engine to all connected WebSockets
engineManager.on('broadcast', (event) => {
    const payload = JSON.stringify(event);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
});

// Start C engine on server boot
engineManager.startEngine();

// Clean termination handlers
function gracefulShutdown(signal) {
    console.log(`\n[Server] Received ${signal}. Gracefully stopping C engine and server...`);
    engineManager.stopEngine();
    server.close(() => {
        console.log('[Server] HTTP and WebSocket server closed cleanly.');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('[Server] Forced shutdown after timeout.');
        process.exit(1);
    }, 2000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start HTTP server
server.listen(PORT, () => {
    console.log('================================================================');
    console.log('  OCTO_OSSP Dining Philosophers Synchronization System');
    console.log(`  Dashboard URL: http://localhost:${PORT}`);
    console.log(`  WebSocket URL: ws://localhost:${PORT}`);
    console.log('================================================================');
});
