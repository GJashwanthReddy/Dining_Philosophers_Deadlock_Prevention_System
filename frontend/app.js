/**
 * OCTO_OSSP Dining Philosophers Concurrency & Deadlock Prevention Dashboard
 * Pair-programming team: G Jashwanth Reddy, Mohammad Zaid Amaan, M Pramod Krishna
 */

const NUM_PHILOSOPHERS = 5;
const PHILOSOPHER_NAMES = ['Socrates (P0)', 'Plato (P1)', 'Aristotle (P2)', 'Descartes (P3)', 'Kant (P4)'];
const PHILOSOPHER_EMOJIS = ['🧠', '📜', '🏛️', '💡', '⚖️'];

// State object
const appState = {
    connected: false,
    engineStatus: 'STOPPED',
    algorithm: 'resource_ordering',
    philosophers: Array.from({ length: NUM_PHILOSOPHERS }, (_, i) => ({
        id: i,
        name: PHILOSOPHER_NAMES[i],
        state: 'THINKING',
        mealsCompleted: 0,
        currentWaitMs: 0
    })),
    forks: Array.from({ length: NUM_PHILOSOPHERS }, (_, i) => ({
        id: i,
        owner: -1,
        available: true
    })),
    metrics: {
        totalMeals: 0,
        averageWaitingTimeMs: 0.0,
        maximumWaitingTimeMs: 0,
        uptimeMs: 0,
        mealsPerPhilosopher: [0, 0, 0, 0, 0]
    },
    deadlock: {
        detected: false,
        cycle: []
    },
    logFilter: 'all',
    autoScroll: true
};

// WebSocket client
let socket = null;
let reconnectTimer = null;

// DOM Elements
const wsStatusBadge = document.getElementById('wsStatusBadge');
const wsStatusDot = document.getElementById('wsStatusDot');
const wsStatusLabel = document.getElementById('wsStatusLabel');
const engineStatusIndicator = document.getElementById('engineStatusIndicator');
const currentAlgoPill = document.getElementById('currentAlgoPill');
const currentAlgoValue = document.getElementById('currentAlgoValue');

const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnResume = document.getElementById('btnResume');
const btnStop = document.getElementById('btnStop');
const btnReset = document.getElementById('btnReset');
const btnDeadlockDemo = document.getElementById('btnDeadlockDemo');
const btnResolveDeadlock = document.getElementById('btnResolveDeadlock');

const algoCards = document.querySelectorAll('.algo-card');
const deadlockBanner = document.getElementById('deadlockBanner');
const hubStateText = document.getElementById('hubStateText');

const tableSvg = document.getElementById('tableSvg');
const philosophersContainer = document.getElementById('philosophersContainer');
const forksContainer = document.getElementById('forksContainer');
const philosophersQuickGrid = document.getElementById('philosophersQuickGrid');

const metricTotalMeals = document.getElementById('metricTotalMeals');
const metricAvgWait = document.getElementById('metricAvgWait');
const metricMaxWait = document.getElementById('metricMaxWait');
const metricUptime = document.getElementById('metricUptime');
const mealsChartContainer = document.getElementById('mealsChartContainer');
const fairnessBadge = document.getElementById('fairnessBadge');

const ragStatusPill = document.getElementById('ragStatusPill');
const statusHoldWait = document.getElementById('statusHoldWait');
const statusCircularWait = document.getElementById('statusCircularWait');

const logContainer = document.getElementById('logContainer');
const btnClearLog = document.getElementById('btnClearLog');
const chkAutoScroll = document.getElementById('chkAutoScroll');
const filterBtns = document.querySelectorAll('.filter-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const sliderThink = document.getElementById('sliderThink');
const sliderEat = document.getElementById('sliderEat');
const valThinkTime = document.getElementById('valThinkTime');
const valEatTime = document.getElementById('valEatTime');
const btnApplyConfig = document.getElementById('btnApplyConfig');

/* ========================================================================= */
/* INITIALIZATION & GEOMETRY                                                 */
/* ========================================================================= */

const SVG_SIZE = 500;
const CENTER_X = SVG_SIZE / 2;
const CENTER_Y = SVG_SIZE / 2;
const RADIUS_PHIL = 175;
const RADIUS_FORK = 115;

function initTableElements() {
    philosophersContainer.innerHTML = '';
    forksContainer.innerHTML = '';
    philosophersQuickGrid.innerHTML = '';

    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
        // Angle for philosopher i: Top is -PI/2
        const anglePhil = (i * 2 * Math.PI / NUM_PHILOSOPHERS) - (Math.PI / 2);
        const px = CENTER_X + RADIUS_PHIL * Math.cos(anglePhil);
        const py = CENTER_Y + RADIUS_PHIL * Math.sin(anglePhil);

        // Angle for fork i (between Phil i and Phil (i+1)%5)
        const angleFork = anglePhil + (Math.PI / NUM_PHILOSOPHERS);
        const fx = CENTER_X + RADIUS_FORK * Math.cos(angleFork);
        const fy = CENTER_Y + RADIUS_FORK * Math.sin(angleFork);

        // Philosopher element
        const pElem = document.createElement('div');
        pElem.className = 'philosopher-node THINKING';
        pElem.id = `philNode_${i}`;
        pElem.style.left = `${(px / SVG_SIZE) * 100}%`;
        pElem.style.top = `${(py / SVG_SIZE) * 100}%`;
        pElem.innerHTML = `
            <div class="p-avatar">${PHILOSOPHER_EMOJIS[i]}</div>
            <div class="p-id">P${i}</div>
        `;
        philosophersContainer.appendChild(pElem);

        // Fork element
        const fElem = document.createElement('div');
        fElem.className = 'fork-node';
        fElem.id = `forkNode_${i}`;
        fElem.style.left = `${(fx / SVG_SIZE) * 100}%`;
        fElem.style.top = `${(fy / SVG_SIZE) * 100}%`;
        fElem.innerHTML = `<span class="fork-id">F${i}</span>`;
        forksContainer.appendChild(fElem);

        // Quick Grid Card
        const miniCard = document.createElement('div');
        miniCard.className = 'p-card-mini';
        miniCard.id = `quickCard_${i}`;
        miniCard.innerHTML = `
            <div class="mini-name">P${i} (${PHILOSOPHER_NAMES[i].split(' ')[0]})</div>
            <div class="mini-state" id="quickState_${i}">THINKING</div>
            <div class="mini-meals" id="quickMeals_${i}">Meals: 0</div>
        `;
        philosophersQuickGrid.appendChild(miniCard);
    }

    renderSvgConnections();
    renderFairnessChart();
}

function getPhilCoordinates(id) {
    const angle = (id * 2 * Math.PI / NUM_PHILOSOPHERS) - (Math.PI / 2);
    return {
        x: CENTER_X + RADIUS_PHIL * Math.cos(angle),
        y: CENTER_Y + RADIUS_PHIL * Math.sin(angle)
    };
}

function getForkCoordinates(id) {
    const angle = (id * 2 * Math.PI / NUM_PHILOSOPHERS) - (Math.PI / 2) + (Math.PI / NUM_PHILOSOPHERS);
    return {
        x: CENTER_X + RADIUS_FORK * Math.cos(angle),
        y: CENTER_Y + RADIUS_FORK * Math.sin(angle)
    };
}

/* Render SVG lines between forks and philosophers based on ownership and requests */
function renderSvgConnections() {
    let svgHtml = '';

    // Draw ownership allocation lines
    for (let f = 0; f < NUM_PHILOSOPHERS; f++) {
        const fork = appState.forks[f];
        if (fork.owner !== -1) {
            const fCoord = getForkCoordinates(f);
            const pCoord = getPhilCoordinates(fork.owner);
            const isDeadlocked = appState.deadlock.detected;
            const strokeColor = isDeadlocked ? '#ef4444' : '#10b981';
            const strokeWidth = isDeadlocked ? '4' : '3';

            svgHtml += `
                <line x1="${fCoord.x}" y1="${fCoord.y}" x2="${pCoord.x}" y2="${pCoord.y}"
                      stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round"
                      filter="drop-shadow(0 0 6px ${strokeColor})" />
            `;
        }
    }

    // If deadlock occurs, draw circular wait directed arrows connecting all 5
    if (appState.deadlock.detected) {
        for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
            const nextPhil = (i + 1) % NUM_PHILOSOPHERS;
            const p1 = getPhilCoordinates(i);
            const p2 = getPhilCoordinates(nextPhil);
            svgHtml += `
                <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"
                      stroke="#ef4444" stroke-width="3" stroke-dasharray="6,4"
                      filter="drop-shadow(0 0 8px #ef4444)">
                    <animate attributeName="stroke-dashoffset" values="20;0" dur="1s" repeatCount="indefinite" />
                </line>
            `;
        }
    }

    tableSvg.innerHTML = svgHtml;
}

/* ========================================================================= */
/* WEBSOCKET CONNECTION                                                      */
/* ========================================================================= */

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    wsStatusLabel.textContent = 'Connecting...';
    wsStatusDot.className = 'status-dot disconnected';

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        appState.connected = true;
        wsStatusLabel.textContent = 'Connected (Live Engine)';
        wsStatusDot.className = 'status-dot connected';
        addLogEntry('SYSTEM', 'WebSocket connection established with C Simulation Engine.', 'info');
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleIncomingEvent(data);
        } catch (e) {
            console.error('Error handling WebSocket message:', e);
        }
    };

    socket.onclose = () => {
        appState.connected = false;
        wsStatusLabel.textContent = 'Disconnected';
        wsStatusDot.className = 'status-dot disconnected';
        addLogEntry('SYSTEM', 'WebSocket disconnected. Retrying in 2 seconds...', 'warn');

        if (!reconnectTimer) {
            reconnectTimer = setInterval(connectWebSocket, 2000);
        }
    };

    socket.onerror = (err) => {
        console.error('WebSocket encountered error:', err);
    };
}

function sendCommand(cmd, extra = {}) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ cmd, ...extra }));
    } else {
        // Fallback to REST API
        fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd, ...extra })
        }).catch(err => console.error('REST command error:', err));
    }
}

/* ========================================================================= */
/* EVENT DISPATCHER                                                          */
/* ========================================================================= */

function handleIncomingEvent(event) {
    switch (event.type) {
        case 'snapshot':
            applySnapshot(event.data, event.recentLogs);
            break;

        case 'status':
            updateEngineStatus(event.status, event.algorithm, event.message);
            break;

        case 'init':
            if (event.algorithm) appState.algorithm = event.algorithm;
            updateAlgoSelectionUI(appState.algorithm);
            updateEngineStatus(event.status, event.algorithm, 'Engine initialized');
            break;

        case 'philosopher_state':
            updatePhilosopherState(event.philosopherId, event.state, event.mealsCompleted, event.currentWaitMs);
            break;

        case 'fork_state':
            updateForkState(event.forkId, event.owner, event.available);
            break;

        case 'metrics':
            updateMetrics(event);
            break;

        case 'deadlock_detected':
            handleDeadlockDetected(event);
            break;

        case 'log':
            addLogEntry('C_ENGINE', event.message, event.level);
            break;
    }
}

function applySnapshot(data, recentLogs) {
    if (!data) return;

    appState.algorithm = data.algorithm || appState.algorithm;
    updateAlgoSelectionUI(appState.algorithm);

    if (data.status) {
        updateEngineStatus(data.status, appState.algorithm, 'Loaded current state snapshot');
    }

    if (data.philosophers) {
        data.philosophers.forEach(p => {
            updatePhilosopherState(p.id, p.state, p.mealsCompleted, p.currentWaitMs);
        });
    }

    if (data.forks) {
        data.forks.forEach(f => {
            updateForkState(f.id, f.owner, f.available);
        });
    }

    if (data.metrics) {
        updateMetrics(data.metrics);
    }

    if (data.deadlock && data.deadlock.detected) {
        handleDeadlockDetected(data.deadlock);
    }

    if (recentLogs && recentLogs.length > 0) {
        recentLogs.forEach(l => addLogEntry('C_ENGINE', l.message, l.level));
    }
}

/* ========================================================================= */
/* STATE UPDATERS                                                            */
/* ========================================================================= */

function updateEngineStatus(status, algo, msg) {
    appState.engineStatus = status;
    engineStatusIndicator.textContent = status;
    engineStatusIndicator.className = `status-indicator ${status}`;
    hubStateText.textContent = status;

    if (algo) {
        appState.algorithm = algo;
        updateAlgoSelectionUI(algo);
    }

    // Control buttons state
    if (status === 'RUNNING') {
        btnStart.disabled = true;
        btnPause.disabled = false;
        btnPause.style.display = 'inline-flex';
        btnResume.style.display = 'none';
        btnStop.disabled = false;
    } else if (status === 'PAUSED') {
        btnStart.disabled = true;
        btnPause.style.display = 'none';
        btnResume.disabled = false;
        btnResume.style.display = 'inline-flex';
        btnStop.disabled = false;
    } else {
        // STOPPED or DEADLOCKED
        btnStart.disabled = false;
        btnPause.disabled = true;
        btnPause.style.display = 'inline-flex';
        btnResume.style.display = 'none';
        btnStop.disabled = (status === 'STOPPED');
    }

    if (status !== 'DEADLOCKED') {
        appState.deadlock.detected = false;
        deadlockBanner.style.display = 'none';
        statusCircularWait.className = 'chk-status broken';
        statusCircularWait.textContent = 'BROKEN';
        ragStatusPill.className = 'pill-mini';
        ragStatusPill.textContent = 'DAG (Acyclic)';
    }

    renderSvgConnections();
}

function updatePhilosopherState(id, state, meals, currentWaitMs) {
    if (id < 0 || id >= NUM_PHILOSOPHERS) return;

    appState.philosophers[id].state = state;
    appState.philosophers[id].mealsCompleted = meals;
    appState.philosophers[id].currentWaitMs = currentWaitMs;

    const node = document.getElementById(`philNode_${id}`);
    if (node) {
        node.className = `philosopher-node ${state}`;
    }

    const quickCard = document.getElementById(`quickCard_${id}`);
    const quickState = document.getElementById(`quickState_${id}`);
    const quickMeals = document.getElementById(`quickMeals_${id}`);

    if (quickCard && quickState && quickMeals) {
        quickState.textContent = state;
        quickState.style.color = getStateColor(state);
        quickMeals.textContent = `Meals: ${meals}`;
        quickCard.className = `p-card-mini ${state === 'EATING' ? 'active-eat' : ''}`;
    }

    renderSvgConnections();
}

function updateForkState(id, owner, available) {
    if (id < 0 || id >= NUM_PHILOSOPHERS) return;

    appState.forks[id].owner = owner;
    appState.forks[id].available = available;

    const fNode = document.getElementById(`forkNode_${id}`);
    if (fNode) {
        if (!available) {
            fNode.className = 'fork-node allocated';
            fNode.innerHTML = `<span class="fork-id">P${owner}</span>`;
        } else {
            fNode.className = 'fork-node';
            fNode.innerHTML = `<span class="fork-id">F${id}</span>`;
        }
    }

    renderSvgConnections();
}

function updateMetrics(m) {
    appState.metrics.totalMeals = m.totalMeals || 0;
    appState.metrics.averageWaitingTimeMs = m.averageWaitingTimeMs || 0.0;
    appState.metrics.maximumWaitingTimeMs = m.maximumWaitingTimeMs || 0;
    appState.metrics.uptimeMs = m.uptimeMs || 0;

    metricTotalMeals.textContent = appState.metrics.totalMeals;
    metricAvgWait.innerHTML = `${appState.metrics.averageWaitingTimeMs.toFixed(1)} <small>ms</small>`;
    metricMaxWait.innerHTML = `${appState.metrics.maximumWaitingTimeMs} <small>ms</small>`;

    // Format uptime mm:ss
    const totalSecs = Math.floor(appState.metrics.uptimeMs / 1000);
    const mins = String(Math.floor(totalSecs / 60)).padStart(2, '0');
    const secs = String(totalSecs % 60).padStart(2, '0');
    metricUptime.textContent = `${mins}:${secs}`;

    if (m.mealsPerPhilosopher) {
        appState.metrics.mealsPerPhilosopher = m.mealsPerPhilosopher;
        renderFairnessChart();
    }
}

function handleDeadlockDetected(event) {
    appState.deadlock.detected = true;
    appState.deadlock.cycle = event.cycle || [0, 1, 2, 3, 4];
    updateEngineStatus('DEADLOCKED', 'naive_left_first', event.description);

    deadlockBanner.style.display = 'flex';
    document.getElementById('deadlockAlertMsg').textContent = event.description ||
        'Circular Wait Formed: All 5 philosophers hold left fork and wait on right fork!';

    statusHoldWait.className = 'chk-status cycle';
    statusHoldWait.textContent = 'ALL HOLDING';

    statusCircularWait.className = 'chk-status cycle';
    statusCircularWait.textContent = 'CYCLE FORMED';

    ragStatusPill.className = 'pill-mini danger';
    ragStatusPill.textContent = 'CYCLE DETECTED';

    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
        const node = document.getElementById(`philNode_${i}`);
        if (node) node.className = 'philosopher-node DEADLOCKED';
        const fNode = document.getElementById(`forkNode_${i}`);
        if (fNode) fNode.className = 'fork-node deadlocked';
    }

    renderSvgConnections();
}

function getStateColor(state) {
    switch (state) {
        case 'THINKING': return 'var(--color-thinking)';
        case 'HUNGRY': return 'var(--color-hungry)';
        case 'WAITING': return 'var(--color-waiting)';
        case 'EATING': return 'var(--color-eating)';
        case 'DEADLOCKED': return 'var(--color-deadlocked)';
        default: return 'var(--text-muted)';
    }
}

function renderFairnessChart() {
    const meals = appState.metrics.mealsPerPhilosopher || [0, 0, 0, 0, 0];
    const maxMeals = Math.max(...meals, 1);
    const minMeals = Math.min(...meals);
    const spread = maxMeals - minMeals;

    let chartHtml = '';
    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
        const pct = Math.round((meals[i] / maxMeals) * 100);
        chartHtml += `
            <div class="chart-bar-row">
                <span class="chart-bar-label">P${i}</span>
                <div class="chart-bar-track">
                    <div class="chart-bar-fill" style="width: ${pct}%;"></div>
                </div>
                <span class="chart-bar-val">${meals[i]}</span>
            </div>
        `;
    }
    mealsChartContainer.innerHTML = chartHtml;

    if (spread <= 2) {
        fairnessBadge.textContent = 'Fairness: Excellent';
        fairnessBadge.style.color = '#34d399';
    } else if (spread <= 5) {
        fairnessBadge.textContent = 'Fairness: Good';
        fairnessBadge.style.color = '#38bdf8';
    } else {
        fairnessBadge.textContent = 'Fairness: Imbalanced';
        fairnessBadge.style.color = '#fbbf24';
    }
}

function updateAlgoSelectionUI(algoId) {
    algoCards.forEach(card => {
        if (card.dataset.algo === algoId) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });

    let displayTitle = 'Resource Ordering';
    if (algoId === 'naive_left_first') displayTitle = 'Naive Left-First';
    else if (algoId === 'fair_fifo') displayTitle = 'Fair FIFO Monitor';

    currentAlgoValue.textContent = displayTitle;
}

/* ========================================================================= */
/* EVENT LOGGING                                                             */
/* ========================================================================= */

function addLogEntry(source, message, level = 'info') {
    const timeStr = new Date().toTimeString().split(' ')[0];
    const entry = document.createElement('div');
    entry.className = `log-entry log-${level}`;

    let tagClass = 'tag-info';
    if (level === 'warn') tagClass = 'tag-warn';
    else if (level === 'error') tagClass = 'tag-error';

    entry.innerHTML = `
        <span class="log-time">[${timeStr}]</span>
        <span class="log-tag ${tagClass}">${source}</span>
        <span class="log-text">${escapeHtml(message)}</span>
    `;

    logContainer.appendChild(entry);

    if (appState.autoScroll) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
}

/* ========================================================================= */
/* EVENT LISTENERS                                                           */
/* ========================================================================= */

btnStart.addEventListener('click', () => {
    sendCommand('start', { algorithm: appState.algorithm });
});

btnPause.addEventListener('click', () => {
    sendCommand('pause');
});

btnResume.addEventListener('click', () => {
    sendCommand('resume');
});

btnStop.addEventListener('click', () => {
    sendCommand('stop');
});

btnReset.addEventListener('click', () => {
    sendCommand('reset');
});

btnDeadlockDemo.addEventListener('click', () => {
    appState.algorithm = 'naive_left_first';
    updateAlgoSelectionUI('naive_left_first');
    sendCommand('demo_deadlock');
});

btnResolveDeadlock.addEventListener('click', () => {
    appState.algorithm = 'resource_ordering';
    updateAlgoSelectionUI('resource_ordering');
    sendCommand('start', { algorithm: 'resource_ordering' });
});

algoCards.forEach(card => {
    card.addEventListener('click', () => {
        const algo = card.dataset.algo;
        appState.algorithm = algo;
        updateAlgoSelectionUI(algo);
        if (appState.engineStatus === 'RUNNING') {
            sendCommand('start', { algorithm: algo });
        }
    });
});

// Timing sliders
sliderThink.addEventListener('input', () => {
    const v = parseInt(sliderThink.value, 10);
    valThinkTime.textContent = `${Math.round(v * 0.7)} - ${Math.round(v * 1.3)} ms`;
});

sliderEat.addEventListener('input', () => {
    const v = parseInt(sliderEat.value, 10);
    valEatTime.textContent = `${Math.round(v * 0.7)} - ${Math.round(v * 1.3)} ms`;
});

btnApplyConfig.addEventListener('click', () => {
    const tCenter = parseInt(sliderThink.value, 10);
    const eCenter = parseInt(sliderEat.value, 10);
    const tMin = Math.round(tCenter * 0.7);
    const tMax = Math.round(tCenter * 1.3);
    const eMin = Math.round(eCenter * 0.7);
    const eMax = Math.round(eCenter * 1.3);

    sendCommand('config', {
        thinkMin: tMin,
        thinkMax: tMax,
        eatMin: eMin,
        eatMax: eMax
    });
});

// Tabs
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPane = document.getElementById(btn.dataset.tab);
        if (targetPane) targetPane.classList.add('active');
    });
});

btnClearLog.addEventListener('click', () => {
    logContainer.innerHTML = '';
});

chkAutoScroll.addEventListener('change', (e) => {
    appState.autoScroll = e.target.checked;
});

// Boot
window.addEventListener('DOMContentLoaded', () => {
    initTableElements();
    connectWebSocket();
});
