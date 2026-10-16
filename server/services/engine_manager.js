const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

class EngineManager extends EventEmitter {
    constructor() {
        super();
        this.process = null;
        this.isWSL = os.platform() === 'win32';
        this.buffer = '';
        this.recentLogs = [];
        this.maxRecentLogs = 100;
        
        // Initial state cache
        this.state = {
            status: 'STOPPED',
            algorithm: 'resource_ordering',
            numPhilosophers: 5,
            thinkMinMs: 800,
            thinkMaxMs: 1600,
            eatMinMs: 800,
            eatMaxMs: 1600,
            philosophers: Array.from({ length: 5 }, (_, i) => ({
                id: i,
                state: 'THINKING',
                leftForkId: i,
                rightForkId: (i + 1) % 5,
                mealsCompleted: 0,
                currentWaitMs: 0
            })),
            forks: Array.from({ length: 5 }, (_, i) => ({
                id: i,
                owner: -1,
                available: true
            })),
            metrics: {
                totalMeals: 0,
                averageWaitingTimeMs: 0.0,
                maximumWaitingTimeMs: 0,
                stateCounts: { thinking: 5, hungry: 0, waiting: 0, eating: 0 },
                uptimeMs: 0,
                mealsPerPhilosopher: [0, 0, 0, 0, 0]
            },
            deadlock: {
                detected: false,
                cycle: [],
                description: ''
            }
        };
    }

    getProjectRoot() {
        // server directory is inside project root
        return path.resolve(__dirname, '..', '..');
    }

    toWslPath(winPath) {
        // e.g. C:\Users\... -> /mnt/c/Users/...
        const resolved = path.resolve(winPath).replace(/\\/g, '/');
        const match = resolved.match(/^([A-Za-z]):\/(.*)$/);
        if (match) {
            const drive = match[1].toLowerCase();
            const rest = match[2];
            return `/mnt/${drive}/${rest}`;
        }
        return resolved;
    }

    startEngine() {
        if (this.process) {
            console.log('[EngineManager] C Engine is already active.');
            return;
        }

        const projectRoot = this.getProjectRoot();
        const binaryRelPath = 'c-engine/bin/simulation_engine';

        let spawnCmd, spawnArgs;

        if (this.isWSL) {
            const wslDir = this.toWslPath(projectRoot);
            spawnCmd = 'wsl';
            spawnArgs = ['-e', 'bash', '-c', `cd "${wslDir}" && exec ./${binaryRelPath}`];
            console.log(`[EngineManager] Spawning C engine in WSL: cd "${wslDir}" && exec ./${binaryRelPath}`);
        } else {
            const binaryPath = path.join(projectRoot, binaryRelPath);
            spawnCmd = binaryPath;
            spawnArgs = [];
            console.log(`[EngineManager] Spawning native Linux C engine: ${binaryPath}`);
        }

        try {
            this.process = spawn(spawnCmd, spawnArgs, {
                cwd: projectRoot,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.process.stdout.on('data', (chunk) => {
                this.handleStdoutData(chunk);
            });

            this.process.stderr.on('data', (chunk) => {
                const text = chunk.toString().trim();
                if (text) {
                    console.error(`[C Engine stderr] ${text}`);
                }
            });

            this.process.on('error', (err) => {
                console.error('[EngineManager] Failed to start C engine process:', err.message);
                this.emit('engine_error', err);
                this.process = null;
            });

            this.process.on('close', (code, signal) => {
                console.log(`[EngineManager] C engine exited with code ${code}, signal ${signal}`);
                this.process = null;
                this.state.status = 'STOPPED';
                this.emit('broadcast', { type: 'status', status: 'STOPPED', algorithm: this.state.algorithm, message: 'C Engine process terminated.' });
            });

        } catch (err) {
            console.error('[EngineManager] Exception spawning engine:', err);
        }
    }

    handleStdoutData(chunk) {
        this.buffer += chunk.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop(); // keep last incomplete line in buffer

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                const event = JSON.parse(trimmed);
                this.processEngineEvent(event);
            } catch (e) {
                // Not standard JSON or non-event line
                console.log(`[C Engine raw] ${trimmed}`);
            }
        }
    }

    processEngineEvent(event) {
        // Update cached state
        switch (event.type) {
            case 'init':
                this.state.algorithm = event.algorithm || this.state.algorithm;
                this.state.numPhilosophers = event.numPhilosophers || 5;
                this.state.status = event.status || this.state.status;
                this.state.thinkMinMs = event.thinkMinMs;
                this.state.thinkMaxMs = event.thinkMaxMs;
                this.state.eatMinMs = event.eatMinMs;
                this.state.eatMaxMs = event.eatMaxMs;
                if (this.state.status !== 'DEADLOCKED') {
                    this.state.deadlock.detected = false;
                    this.state.deadlock.cycle = [];
                    this.state.deadlock.description = '';
                }
                break;

            case 'status':
                this.state.status = event.status;
                if (event.algorithm) this.state.algorithm = event.algorithm;
                if (event.status !== 'DEADLOCKED') {
                    this.state.deadlock.detected = false;
                    this.state.deadlock.cycle = [];
                    this.state.deadlock.description = '';
                }
                break;

            case 'philosopher_state':
                if (this.state.philosophers[event.philosopherId]) {
                    this.state.philosophers[event.philosopherId].state = event.state;
                    this.state.philosophers[event.philosopherId].mealsCompleted = event.mealsCompleted;
                    this.state.philosophers[event.philosopherId].currentWaitMs = event.currentWaitMs;
                }
                break;

            case 'fork_state':
                if (this.state.forks[event.forkId]) {
                    this.state.forks[event.forkId].owner = event.owner;
                    this.state.forks[event.forkId].available = event.available;
                }
                break;

            case 'metrics':
                this.state.metrics.totalMeals = event.totalMeals;
                this.state.metrics.averageWaitingTimeMs = event.averageWaitingTimeMs;
                this.state.metrics.maximumWaitingTimeMs = event.maximumWaitingTimeMs;
                this.state.metrics.stateCounts = event.stateCounts;
                this.state.metrics.uptimeMs = event.uptimeMs;
                if (event.mealsPerPhilosopher) {
                    this.state.metrics.mealsPerPhilosopher = event.mealsPerPhilosopher;
                }
                break;

            case 'deadlock_detected':
                this.state.status = 'DEADLOCKED';
                this.state.deadlock.detected = true;
                this.state.deadlock.cycle = event.cycle;
                this.state.deadlock.description = event.description;
                break;

            case 'log':
                this.recentLogs.push(event);
                if (this.recentLogs.length > this.maxRecentLogs) {
                    this.recentLogs.shift();
                }
                break;
        }

        // Broadcast to WebSocket clients
        this.emit('broadcast', event);
    }

    sendCommand(cmdStr) {
        if (!this.process) {
            console.log('[EngineManager] Engine not started yet. Launching engine before sending command...');
            this.startEngine();
        }

        if (this.process && this.process.stdin.writable) {
            console.log(`[EngineManager] Sending command to C engine: ${cmdStr}`);
            this.process.stdin.write(cmdStr.trim() + '\n');
        } else {
            console.error('[EngineManager] Cannot send command: stdin is not writable');
        }
    }

    getSnapshot() {
        return {
            type: 'snapshot',
            timestampMs: Date.now(),
            data: this.state,
            recentLogs: this.recentLogs
        };
    }

    stopEngine() {
        if (this.process) {
            console.log('[EngineManager] Stopping C engine process...');
            try {
                this.process.stdin.write('QUIT\n');
            } catch (e) {}

            setTimeout(() => {
                if (this.process) {
                    try {
                        this.process.kill('SIGTERM');
                    } catch (e) {}
                }
            }, 500);
        }
    }
}

module.exports = new EngineManager();
