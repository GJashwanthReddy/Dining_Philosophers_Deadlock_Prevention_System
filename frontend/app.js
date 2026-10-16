/**
 * OCTO_OSSP Dining Philosophers Concurrency & Deadlock Prevention Dashboard
 * Team Members: G Jashwanth Reddy, Mohammad Zaid Amaan, M Pramod Krishna
 * Multi-Page SPA Navigation with Persistent Full-Duplex WebSocket Engine Connection
 */

const NUM_PHILOSOPHERS = 5;
const PHILOSOPHER_NAMES = ['Socrates (P0)', 'Plato (P1)', 'Aristotle (P2)', 'Descartes (P3)', 'Kant (P4)'];
const PHILOSOPHER_EMOJIS = ['🧠', '📜', '🏛️', '💡', '⚖️'];

// Application State
const appState = {
    currentPage: 'simulation',
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
    // Log management
    logs: [],
    maxLogs: 500,
    logFilterCategory: 'all',
    logFilterPhil: 'all',
    logSearchQuery: '',
    autoScrollLogs: true
};

// WebSocket client
let socket = null;
let reconnectTimer = null;

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const pageViews = document.querySelectorAll('.page-view');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mainNav = document.getElementById('mainNav');

const wsStatusBadge = document.getElementById('wsStatusBadge');
const wsStatusDot = document.getElementById('wsStatusDot');
const wsStatusLabel = document.getElementById('wsStatusLabel');
const engineStatusIndicator = document.getElementById('engineStatusIndicator');
const currentAlgoValue = document.getElementById('currentAlgoValue');

// Page 1 Elements
const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnResume = document.getElementById('btnResume');
const btnStop = document.getElementById('btnStop');
const btnReset = document.getElementById('btnReset');
const btnDeadlockDemo = document.getElementById('btnDeadlockDemo');
const btnResolveDeadlock = document.getElementById('btnResolveDeadlock');
const algoOptionCards = document.querySelectorAll('.algo-option-card');

const metricTotalMeals = document.getElementById('metricTotalMeals');
const metricAvgWait = document.getElementById('metricAvgWait');
const metricMaxWait = document.getElementById('metricMaxWait');
const metricUptime = document.getElementById('metricUptime');

const deadlockBanner = document.getElementById('deadlockBanner');
const deadlockAlertMsg = document.getElementById('deadlockAlertMsg');
const hubStateText = document.getElementById('hubStateText');
const tableSvg = document.getElementById('tableSvg');
const philosophersContainer = document.getElementById('philosophersContainer');
const forksContainer = document.getElementById('forksContainer');
const philosophersQuickGrid = document.getElementById('philosophersQuickGrid');
const tickerFeed = document.getElementById('tickerFeed');
const btnViewAllLogs = document.getElementById('btnViewAllLogs');

const sliderThink = document.getElementById('sliderThink');
const sliderEat = document.getElementById('sliderEat');
const valThinkTime = document.getElementById('valThinkTime');
const valEatTime = document.getElementById('valEatTime');
const btnApplyConfig = document.getElementById('btnApplyConfig');

// Page 2 Elements (Comparison)
const btnCompStartResource = document.getElementById('btnCompStartResource');
const btnCompStartFifo = document.getElementById('btnCompStartFifo');
const btnCompStartNaive = document.getElementById('btnCompStartNaive');
const btnResetMetrics = document.getElementById('btnResetMetrics');
const compMealsChartContainer = document.getElementById('compMealsChartContainer');
const compFairnessBadge = document.getElementById('compFairnessBadge');
const compTotalMeals = document.getElementById('compTotalMeals');
const compAvgWait = document.getElementById('compAvgWait');
const compMaxWait = document.getElementById('compMaxWait');
const compMealSpread = document.getElementById('compMealSpread');

// Page 3 Elements (Logs)
const logTotalCount = document.getElementById('logTotalCount');
const logEngineStatus = document.getElementById('logEngineStatus');
const logUptimeText = document.getElementById('logUptimeText');
const logSearchInput = document.getElementById('logSearchInput');
const logPhilFilter = document.getElementById('logPhilFilter');
const logCategoryPills = document.querySelectorAll('#logCategoryPills .pill-btn');
const chkLogAutoScroll = document.getElementById('chkLogAutoScroll');
const btnClearFullLog = document.getElementById('btnClearFullLog');
const btnExportLog = document.getElementById('btnExportLog');
const fullLogContainer = document.getElementById('fullLogContainer');

/* ========================================================================= */
/* 1. MULTI-PAGE SPA NAVIGATION & ROUTING                                    */
/* ========================================================================= */

function switchPage(pageId) {
    if (!['simulation', 'comparison', 'logs', 'concepts'].includes(pageId)) {
        pageId = 'simulation';
    }

    appState.currentPage = pageId;

    // Update Nav bar
    navItems.forEach(item => {
        if (item.dataset.page === pageId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Update Page Views
    pageViews.forEach(view => {
        if (view.id === `page-${pageId}`) {
            view.classList.add('active');
        } else {
            view.classList.remove('active');
        }
    });

    // Update URL hash without reload
    if (window.location.hash !== `#/${pageId}`) {
        window.location.hash = `#/${pageId}`;
    }

    // Close mobile menu if open
    if (mainNav.classList.contains('mobile-open')) {
        mainNav.classList.remove('mobile-open');
    }

    // Specific page enter triggers
    if (pageId === 'simulation') {
        renderSvgConnections();
    } else if (pageId === 'comparison') {
        renderComparisonCharts();
    } else if (pageId === 'logs') {
        renderFilteredLogs();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleHashChange() {
    const hash = window.location.hash.replace('#/', '');
    if (hash) {
        switchPage(hash);
    } else {
        switchPage('simulation');
    }
}

navItems.forEach(item => {
    item.addEventListener('click', () => {
        switchPage(item.dataset.page);
    });
});

window.addEventListener('hashchange', handleHashChange);

if (btnViewAllLogs) {
    btnViewAllLogs.addEventListener('click', () => {
        switchPage('logs');
    });
}

if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
        mainNav.classList.toggle('mobile-open');
    });
}

/* ========================================================================= */
/* 2. GEOMETRY & DINING TABLE INITIALIZATION                                 */
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
        const anglePhil = (i * 2 * Math.PI / NUM_PHILOSOPHERS) - (Math.PI / 2);
        const px = CENTER_X + RADIUS_PHIL * Math.cos(anglePhil);
        const py = CENTER_Y + RADIUS_PHIL * Math.sin(anglePhil);

        const angleFork = anglePhil + (Math.PI / NUM_PHILOSOPHERS);
        const fx = CENTER_X + RADIUS_FORK * Math.cos(angleFork);
        const fy = CENTER_Y + RADIUS_FORK * Math.sin(angleFork);

        // Philosopher Node
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

        // Fork Node
        const fElem = document.createElement('div');
        fElem.className = 'fork-node';
        fElem.id = `forkNode_${i}`;
        fElem.style.left = `${(fx / SVG_SIZE) * 100}%`;
        fElem.style.top = `${(fy / SVG_SIZE) * 100}%`;
        fElem.innerHTML = `<span class="fork-id">F${i}</span>`;
        forksContainer.appendChild(fElem);

        // Quick Summary Card
        const summaryCard = document.createElement('div');
        summaryCard.className = 'p-summary-card';
        summaryCard.id = `summaryCard_${i}`;
        summaryCard.innerHTML = `
            <div class="p-summary-name">P${i} (${PHILOSOPHER_NAMES[i].split(' ')[0]})</div>
            <div class="p-summary-state" id="summaryState_${i}">THINKING</div>
            <div class="p-summary-meals" id="summaryMeals_${i}">Meals: 0</div>
        `;
        philosophersQuickGrid.appendChild(summaryCard);
    }

    renderSvgConnections();
    renderComparisonCharts();
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

function renderSvgConnections() {
    let svgHtml = '';

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
/* 3. PERSISTENT WEBSOCKET ENGINE CONNECTION                                 */
/* ========================================================================= */

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    wsStatusLabel.textContent = 'Connecting...';
    wsStatusDot.className = 'status-dot disconnected';

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        appState.connected = true;
        wsStatusLabel.textContent = 'Connected';
        wsStatusDot.className = 'status-dot connected';
        recordLog('SYSTEM', 'WebSocket connection established with C simulation engine.', 'system');
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
            console.error('Error parsing incoming WebSocket message:', e);
        }
    };

    socket.onclose = () => {
        appState.connected = false;
        wsStatusLabel.textContent = 'Disconnected';
        wsStatusDot.className = 'status-dot disconnected';
        recordLog('SYSTEM', 'WebSocket disconnected. Retrying in 2 seconds...', 'warn');

        if (!reconnectTimer) {
            reconnectTimer = setInterval(connectWebSocket, 2000);
        }
    };

    socket.onerror = (err) => {
        console.error('WebSocket encountered an error:', err);
    };
}

function sendCommand(cmd, extra = {}) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ cmd, ...extra }));
    } else {
        fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd, ...extra })
        }).catch(err => console.error('REST command error:', err));
    }
}

/* ========================================================================= */
/* 4. EVENT DISPATCHING & STATE UPDATES                                      */
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
            recordLog('C_ENGINE', event.message, event.level || 'info');
            break;
    }
}

function applySnapshot(data, recentLogs) {
    if (!data) return;

    appState.algorithm = data.algorithm || appState.algorithm;
    updateAlgoSelectionUI(appState.algorithm);

    if (data.status) {
        updateEngineStatus(data.status, appState.algorithm, 'Loaded engine snapshot');
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
        recentLogs.forEach(l => recordLog('C_ENGINE', l.message, l.level || 'info'));
    }
}

function updateEngineStatus(status, algo, msg) {
    appState.engineStatus = status;
    engineStatusIndicator.textContent = status;
    engineStatusIndicator.className = `engine-indicator ${status}`;
    hubStateText.textContent = status;
    if (logEngineStatus) logEngineStatus.textContent = status;

    if (algo) {
        appState.algorithm = algo;
        updateAlgoSelectionUI(algo);
    }

    // Button states
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

    const card = document.getElementById(`summaryCard_${id}`);
    const stateLabel = document.getElementById(`summaryState_${id}`);
    const mealsLabel = document.getElementById(`summaryMeals_${id}`);

    if (card && stateLabel && mealsLabel) {
        stateLabel.textContent = state;
        stateLabel.style.color = getStateColor(state);
        mealsLabel.textContent = `Meals: ${meals}`;
        card.className = `p-summary-card ${state === 'EATING' ? 'eating' : ''}`;
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

    // Page 1 Essential metrics
    metricTotalMeals.textContent = appState.metrics.totalMeals;
    metricAvgWait.innerHTML = `${appState.metrics.averageWaitingTimeMs.toFixed(1)} <small>ms</small>`;
    metricMaxWait.innerHTML = `${appState.metrics.maximumWaitingTimeMs} <small>ms</small>`;

    // Format uptime mm:ss
    const totalSecs = Math.floor(appState.metrics.uptimeMs / 1000);
    const mins = String(Math.floor(totalSecs / 60)).padStart(2, '0');
    const secs = String(totalSecs % 60).padStart(2, '0');
    metricUptime.textContent = `${mins}:${secs}`;
    if (logUptimeText) logUptimeText.textContent = `${mins}:${secs}`;

    if (m.mealsPerPhilosopher) {
        appState.metrics.mealsPerPhilosopher = m.mealsPerPhilosopher;
        renderComparisonCharts();
    }
}

function handleDeadlockDetected(event) {
    appState.deadlock.detected = true;
    appState.deadlock.cycle = event.cycle || [0, 1, 2, 3, 4];
    updateEngineStatus('DEADLOCKED', 'naive_left_first', event.description);

    deadlockBanner.style.display = 'flex';
    deadlockAlertMsg.textContent = event.description ||
        'Circular Wait Formed: All 5 philosophers hold left fork and wait on right fork!';

    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
        const node = document.getElementById(`philNode_${i}`);
        if (node) node.className = 'philosopher-node DEADLOCKED';
        const fNode = document.getElementById(`forkNode_${i}`);
        if (fNode) fNode.className = 'fork-node deadlocked';
    }

    renderSvgConnections();
    recordLog('DEADLOCK', event.description || 'Deadlock confirmed: Circular wait established.', 'error');
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

function updateAlgoSelectionUI(algoId) {
    algoOptionCards.forEach(card => {
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
/* 5. PAGE 2: COMPARISON & FAIRNESS CHARTS                                   */
/* ========================================================================= */

function renderComparisonCharts() {
    const meals = appState.metrics.mealsPerPhilosopher || [0, 0, 0, 0, 0];
    const maxMeals = Math.max(...meals, 1);
    const minMeals = Math.min(...meals);
    const spread = maxMeals - minMeals;

    // Update Comparison stat boxes
    if (compTotalMeals) compTotalMeals.textContent = appState.metrics.totalMeals;
    if (compAvgWait) compAvgWait.innerHTML = `${appState.metrics.averageWaitingTimeMs.toFixed(1)} <small>ms</small>`;
    if (compMaxWait) compMaxWait.innerHTML = `${appState.metrics.maximumWaitingTimeMs} <small>ms</small>`;
    if (compMealSpread) compMealSpread.textContent = spread;

    if (compFairnessBadge) {
        if (spread <= 2) {
            compFairnessBadge.textContent = 'Fairness: Excellent';
            compFairnessBadge.style.color = '#34d399';
        } else if (spread <= 5) {
            compFairnessBadge.textContent = 'Fairness: Good';
            compFairnessBadge.style.color = '#38bdf8';
        } else {
            compFairnessBadge.textContent = 'Fairness: Asymmetric';
            compFairnessBadge.style.color = '#fbbf24';
        }
    }

    if (!compMealsChartContainer) return;

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
    compMealsChartContainer.innerHTML = chartHtml;
}

// Comparison page control triggers
if (btnCompStartResource) {
    btnCompStartResource.addEventListener('click', () => {
        appState.algorithm = 'resource_ordering';
        updateAlgoSelectionUI('resource_ordering');
        sendCommand('start', { algorithm: 'resource_ordering' });
        recordLog('BENCHMARK', 'Launched Resource Ordering comparison run.', 'info');
    });
}

if (btnCompStartFifo) {
    btnCompStartFifo.addEventListener('click', () => {
        appState.algorithm = 'fair_fifo';
        updateAlgoSelectionUI('fair_fifo');
        sendCommand('start', { algorithm: 'fair_fifo' });
        recordLog('BENCHMARK', 'Launched Fair FIFO Monitor comparison run.', 'info');
    });
}

if (btnCompStartNaive) {
    btnCompStartNaive.addEventListener('click', () => {
        appState.algorithm = 'naive_left_first';
        updateAlgoSelectionUI('naive_left_first');
        sendCommand('demo_deadlock');
        recordLog('BENCHMARK', 'Triggered Naive Left-First circular wait benchmark.', 'warn');
    });
}

if (btnResetMetrics) {
    btnResetMetrics.addEventListener('click', () => {
        sendCommand('reset');
        recordLog('BENCHMARK', 'Reset all benchmark meal counters and wait metrics.', 'info');
    });
}

/* ========================================================================= */
/* 6. PAGE 3: EVENT LOG & MONITORING                                         */
/* ========================================================================= */

function recordLog(category, message, level = 'info') {
    const ts = new Date().toTimeString().split(' ')[0] + '.' + String(new Date().getMilliseconds()).padStart(3, '0');
    const logItem = {
        id: Date.now() + Math.random(),
        timestamp: ts,
        category: category.toUpperCase(),
        message: message,
        level: level
    };

    appState.logs.push(logItem);
    if (appState.logs.length > appState.maxLogs) {
        appState.logs.shift();
    }

    if (logTotalCount) logTotalCount.textContent = appState.logs.length;

    // Append to compact live ticker on Page 1
    if (tickerFeed) {
        const itemElem = document.createElement('div');
        itemElem.className = 'ticker-item';
        itemElem.innerHTML = `<span class="ticker-time">[${ts.split('.')[0]}]</span> ${escapeHtml(message)}`;
        tickerFeed.appendChild(itemElem);
        while (tickerFeed.children.length > 4) {
            tickerFeed.removeChild(tickerFeed.firstChild);
        }
    }

    // Append to Page 3 if matches filters
    if (appState.currentPage === 'logs') {
        renderFilteredLogs();
    }
}

function renderFilteredLogs() {
    if (!fullLogContainer) return;

    const query = appState.logSearchQuery.toLowerCase();
    const cat = appState.logFilterCategory;
    const phil = appState.logFilterPhil;

    const filtered = appState.logs.filter(item => {
        // Text search
        if (query && !item.message.toLowerCase().includes(query) && !item.category.toLowerCase().includes(query)) {
            return false;
        }

        // Category filter
        if (cat === 'state' && !item.message.includes('THINKING') && !item.message.includes('HUNGRY') && !item.message.includes('WAITING') && !item.message.includes('EATING')) {
            return false;
        }
        if (cat === 'fork' && !item.message.toLowerCase().includes('fork')) {
            return false;
        }
        if (cat === 'deadlock' && item.category !== 'DEADLOCK' && !item.message.toLowerCase().includes('deadlock') && !item.message.toLowerCase().includes('circular')) {
            return false;
        }
        if (cat === 'system' && item.category !== 'SYSTEM' && item.category !== 'BENCHMARK') {
            return false;
        }

        // Philosopher ID filter
        if (phil !== 'all') {
            const needle = `philosopher ${phil}`;
            const needleP = `p${phil}`;
            if (!item.message.toLowerCase().includes(needle) && !item.message.toLowerCase().includes(needleP)) {
                return false;
            }
        }

        return true;
    });

    let html = '';
    filtered.forEach(log => {
        let tagClass = 'info';
        if (log.level === 'warn') tagClass = 'warn';
        else if (log.level === 'error' || log.category === 'DEADLOCK') tagClass = 'error';
        else if (log.category === 'SYSTEM') tagClass = 'system';

        html += `
            <div class="log-entry-row">
                <span class="log-ts">[${log.timestamp}]</span>
                <span class="log-cat ${tagClass}">${log.category}</span>
                <span class="log-msg">${escapeHtml(log.message)}</span>
            </div>
        `;
    });

    fullLogContainer.innerHTML = html;

    if (appState.autoScrollLogs) {
        fullLogContainer.scrollTop = fullLogContainer.scrollHeight;
    }
}

// Log Search Input
if (logSearchInput) {
    logSearchInput.addEventListener('input', (e) => {
        appState.logSearchQuery = e.target.value;
        renderFilteredLogs();
    });
}

// Log Philosopher Dropdown Filter
if (logPhilFilter) {
    logPhilFilter.addEventListener('change', (e) => {
        appState.logFilterPhil = e.target.value;
        renderFilteredLogs();
    });
}

// Log Category Pills
logCategoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
        logCategoryPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        appState.logFilterCategory = pill.dataset.filter;
        renderFilteredLogs();
    });
});

// Auto-Scroll Checkbox
if (chkLogAutoScroll) {
    chkLogAutoScroll.addEventListener('change', (e) => {
        appState.autoScrollLogs = e.target.checked;
    });
}

// Clear Log Button
if (btnClearFullLog) {
    btnClearFullLog.addEventListener('click', () => {
        appState.logs = [];
        if (logTotalCount) logTotalCount.textContent = '0';
        renderFilteredLogs();
    });
}

// Download JSON Log
if (btnExportLog) {
    btnExportLog.addEventListener('click', () => {
        const jsonStr = JSON.stringify(appState.logs, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dining_philosophers_log_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
}

/* ========================================================================= */
/* 7. PAGE 1 CONTROLS EVENT LISTENERS                                        */
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

algoOptionCards.forEach(card => {
    card.addEventListener('click', () => {
        const algo = card.dataset.algo;
        appState.algorithm = algo;
        updateAlgoSelectionUI(algo);
        if (appState.engineStatus === 'RUNNING') {
            sendCommand('start', { algorithm: algo });
        }
    });
});

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
    sendCommand('config', {
        thinkMin: Math.round(tCenter * 0.7),
        thinkMax: Math.round(tCenter * 1.3),
        eatMin: Math.round(eCenter * 0.7),
        eatMax: Math.round(eCenter * 1.3)
    });
});

/* ========================================================================= */
/* 8. BOOTSTRAP INITIALIZATION                                               */
/* ========================================================================= */

window.addEventListener('DOMContentLoaded', () => {
    initTableElements();
    connectWebSocket();
    handleHashChange();
});
