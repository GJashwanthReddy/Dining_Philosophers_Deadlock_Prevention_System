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
const deadlockCycleBreakdown = document.getElementById('deadlockCycleBreakdown');
const topologyWarningBanner = document.getElementById('topologyWarningBanner');
const topologyWarningMsg = document.getElementById('topologyWarningMsg');
const hubStateText = document.getElementById('hubStateText');
const diningTable = document.getElementById('diningTable');
const tableSvg = document.getElementById('tableSvg');
const philosophersContainer = document.getElementById('philosophersContainer');
const forksContainer = document.getElementById('forksContainer');
const tableTooltip = document.getElementById('tableTooltip');
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

/**
 * Strict Adjacency Validator:
 * For a 5-philosopher circle:
 * Philosopher i shares:
 * - Left Fork: i
 * - Right Fork: (i + 1) % 5
 */
function isForkAdjacentToPhilosopher(forkId, philId) {
    if (philId < 0 || philId >= NUM_PHILOSOPHERS) return false;
    const left = philId;
    const right = (philId + 1) % NUM_PHILOSOPHERS;
    return forkId === left || forkId === right;
}

function showTopologyWarning(pId, fId) {
    if (topologyWarningBanner && topologyWarningMsg) {
        topologyWarningMsg.textContent = `CRITICAL TOPOLOGY FAULT: Attempted connection between non-adjacent Philosopher P${pId} and Fork F${fId}! Blocked by validator.`;
        topologyWarningBanner.style.display = 'flex';
    }
}

function showTooltip(x, y, html) {
    if (!tableTooltip) return;
    tableTooltip.innerHTML = html;
    tableTooltip.style.display = 'block';
    tableTooltip.style.left = `${Math.min(x + 12, 320)}px`;
    tableTooltip.style.top = `${Math.max(y - 15, 10)}px`;
}

function hideTooltip() {
    if (!tableTooltip) return;
    tableTooltip.style.display = 'none';
}

function initTableElements() {
    philosophersContainer.innerHTML = '';
    forksContainer.innerHTML = '';
    philosophersQuickGrid.innerHTML = '';

    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
        // Philosopher i position around circle (-90 deg offset starts P0 at 12 o'clock)
        const anglePhil = (i * 2 * Math.PI / NUM_PHILOSOPHERS) - (Math.PI / 2);
        const px = CENTER_X + RADIUS_PHIL * Math.cos(anglePhil);
        const py = CENTER_Y + RADIUS_PHIL * Math.sin(anglePhil);

        // Fork i sits at midpoint between P_{(i+4)%5} and P_i: anglePhil - (PI / 5)
        const angleFork = anglePhil - (Math.PI / NUM_PHILOSOPHERS);
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

        // Interactive Philosopher Tooltip
        pElem.addEventListener('mouseenter', (e) => {
            const rect = diningTable.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const p = appState.philosophers[i];
            const leftF = i;
            const rightF = (i + 1) % NUM_PHILOSOPHERS;
            const held = [];
            if (appState.forks[leftF]?.owner === i) held.push(`F${leftF}`);
            if (appState.forks[rightF]?.owner === i) held.push(`F${rightF}`);

            let needs = 'None';
            if (appState.deadlock.detected) {
                needs = `F${rightF} (held by P${rightF})`;
            } else if (p.state === 'WAITING' || p.state === 'HUNGRY') {
                if (held.includes(`F${leftF}`)) needs = `F${rightF} (held by P${rightF})`;
                else if (held.includes(`F${rightF}`)) needs = `F${leftF} (held by P${(i + 4) % NUM_PHILOSOPHERS})`;
                else needs = `F${leftF} & F${rightF}`;
            }

            showTooltip(x, y, `
                <div class="tt-header"><span>🧠</span> ${PHILOSOPHER_NAMES[i]}</div>
                <div class="tt-row"><strong>Assigned Forks:</strong> Left F${leftF}, Right F${rightF}</div>
                <div class="tt-row"><strong>Current State:</strong> <span class="tt-badge" style="background:${getStateColor(p.state)};color:#fff">${p.state}</span></div>
                <div class="tt-row"><strong>Held Forks:</strong> ${held.length ? held.join(', ') : 'None'}</div>
                <div class="tt-row"><strong>Requested Fork:</strong> ${needs}</div>
                <div class="tt-row"><strong>Meals Completed:</strong> ${p.mealsCompleted}</div>
            `);
        });
        pElem.addEventListener('mousemove', (e) => {
            const rect = diningTable.getBoundingClientRect();
            tableTooltip.style.left = `${Math.min(e.clientX - rect.left + 12, 320)}px`;
            tableTooltip.style.top = `${Math.max(e.clientY - rect.top - 15, 10)}px`;
        });
        pElem.addEventListener('mouseleave', hideTooltip);

        philosophersContainer.appendChild(pElem);

        // Fork Node
        const fElem = document.createElement('div');
        fElem.className = 'fork-node';
        fElem.id = `forkNode_${i}`;
        fElem.style.left = `${(fx / SVG_SIZE) * 100}%`;
        fElem.style.top = `${(fy / SVG_SIZE) * 100}%`;
        fElem.innerHTML = `<span class="fork-id">F${i}</span>`;

        // Interactive Fork Tooltip
        fElem.addEventListener('mouseenter', (e) => {
            const rect = diningTable.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const fork = appState.forks[i];
            const leftPhil = i;
            const rightPhil = (i + NUM_PHILOSOPHERS - 1) % NUM_PHILOSOPHERS;

            let ownerText = 'Available on table';
            let badgeClass = 'avail';
            if (fork.owner !== -1) {
                ownerText = `Acquired by P${fork.owner} (${PHILOSOPHER_NAMES[fork.owner].split(' ')[0]})`;
                badgeClass = 'busy';
            }

            const requesters = [];
            for (let p = 0; p < NUM_PHILOSOPHERS; p++) {
                const phil = appState.philosophers[p];
                if (phil.state === 'WAITING' || phil.state === 'HUNGRY') {
                    if (isForkAdjacentToPhilosopher(i, p) && fork.owner !== p) {
                        requesters.push(`P${p}`);
                    }
                }
            }

            showTooltip(x, y, `
                <div class="tt-header"><span>🍴</span> Fork F${i}</div>
                <div class="tt-row"><strong>Shared by:</strong> P${rightPhil} (Right) & P${leftPhil} (Left)</div>
                <div class="tt-row"><strong>Status:</strong> <span class="tt-badge ${badgeClass}">${ownerText}</span></div>
                <div class="tt-row"><strong>Waiting For It:</strong> ${requesters.length ? requesters.join(', ') : 'None'}</div>
            `);
        });
        fElem.addEventListener('mousemove', (e) => {
            const rect = diningTable.getBoundingClientRect();
            tableTooltip.style.left = `${Math.min(e.clientX - rect.left + 12, 320)}px`;
            tableTooltip.style.top = `${Math.max(e.clientY - rect.top - 15, 10)}px`;
        });
        fElem.addEventListener('mouseleave', hideTooltip);

        forksContainer.appendChild(fElem);

        // Quick Summary Card with explicit fork topology
        const summaryCard = document.createElement('div');
        summaryCard.className = 'p-summary-card';
        summaryCard.id = `summaryCard_${i}`;
        summaryCard.innerHTML = `
            <div class="p-summary-name">P${i} (${PHILOSOPHER_NAMES[i].split(' ')[0]})</div>
            <div class="p-summary-forks">Forks: [L: F${i} | R: F${(i + 1) % NUM_PHILOSOPHERS}]</div>
            <div class="p-summary-state" id="summaryState_${i}">THINKING</div>
            <div class="p-summary-held" id="summaryHeld_${i}">Held: None</div>
            <div class="p-summary-needs" id="summaryNeeds_${i}">Needs: None</div>
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
    // Fork id sits at the midpoint between Philosopher (id + 4) % 5 and Philosopher id
    // Exact angle: anglePhil(id) - (Math.PI / NUM_PHILOSOPHERS)
    const angle = (id * 2 * Math.PI / NUM_PHILOSOPHERS) - (Math.PI / 2) - (Math.PI / NUM_PHILOSOPHERS);
    return {
        x: CENTER_X + RADIUS_FORK * Math.cos(angle),
        y: CENTER_Y + RADIUS_FORK * Math.sin(angle)
    };
}

function renderSvgConnections() {
    let svgHtml = '';

    // =========================================================================
    // LAYER 1: Subtle Static Adjacency Guide Lines
    // Shows true physical circular topology between philosophers and their 2 adjacent forks
    // =========================================================================
    for (let p = 0; p < NUM_PHILOSOPHERS; p++) {
        const pCoord = getPhilCoordinates(p);
        const leftFork = p;
        const rightFork = (p + 1) % NUM_PHILOSOPHERS;

        const fLeftCoord = getForkCoordinates(leftFork);
        const fRightCoord = getForkCoordinates(rightFork);

        svgHtml += `
            <line x1="${pCoord.x}" y1="${pCoord.y}" x2="${fLeftCoord.x}" y2="${fLeftCoord.y}"
                  stroke="rgba(148, 163, 184, 0.16)" stroke-width="1.5" stroke-dasharray="3,3" />
            <line x1="${pCoord.x}" y1="${pCoord.y}" x2="${fRightCoord.x}" y2="${fRightCoord.y}"
                  stroke="rgba(148, 163, 184, 0.16)" stroke-width="1.5" stroke-dasharray="3,3" />
        `;
    }

    // =========================================================================
    // LAYER 2: Active Acquired Fork Lines (Solid Emerald or Coral Red)
    // Connecting fork to the adjacent philosopher who currently owns it
    // =========================================================================
    for (let f = 0; f < NUM_PHILOSOPHERS; f++) {
        const fork = appState.forks[f];
        if (fork.owner !== -1) {
            // Strict topology assertion
            if (!isForkAdjacentToPhilosopher(f, fork.owner)) {
                console.error(`[TOPOLOGY VIOLATION] Fork F${f} claimed by non-adjacent Philosopher P${fork.owner}`);
                showTopologyWarning(fork.owner, f);
                continue; // Do NOT draw illegal non-adjacent line!
            }

            const fCoord = getForkCoordinates(f);
            const pCoord = getPhilCoordinates(fork.owner);
            const isDeadlocked = appState.deadlock.detected;
            const philState = appState.philosophers[fork.owner]?.state;

            let strokeColor = '#10b981';
            let strokeWidth = '3.5';
            let filterGlow = 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.7))';

            if (isDeadlocked) {
                strokeColor = '#ef4444';
                filterGlow = 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.8))';
            } else if (philState === 'EATING') {
                strokeColor = '#10b981';
                strokeWidth = '4';
                filterGlow = 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.9))';
            }

            svgHtml += `
                <line x1="${fCoord.x}" y1="${fCoord.y}" x2="${pCoord.x}" y2="${pCoord.y}"
                      stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round"
                      filter="${filterGlow}" />
            `;
        }
    }

    // =========================================================================
    // LAYER 3: Active Requested Fork Lines (Animated Amber Dashed)
    // Connects waiting/hungry philosopher to adjacent fork being requested
    // =========================================================================
    if (!appState.deadlock.detected) {
        for (let p = 0; p < NUM_PHILOSOPHERS; p++) {
            const phil = appState.philosophers[p];
            if (phil.state === 'WAITING' || phil.state === 'HUNGRY') {
                const pCoord = getPhilCoordinates(p);
                const leftF = p;
                const rightF = (p + 1) % NUM_PHILOSOPHERS;

                const holdsLeft = (appState.forks[leftF]?.owner === p);
                const holdsRight = (appState.forks[rightF]?.owner === p);

                const neededForks = [];
                if (holdsLeft && !holdsRight) {
                    neededForks.push(rightF);
                } else if (!holdsLeft && holdsRight) {
                    neededForks.push(leftF);
                } else if (!holdsLeft && !holdsRight) {
                    if (appState.algorithm === 'resource_ordering') {
                        neededForks.push(Math.min(leftF, rightF));
                    } else if (appState.algorithm === 'fair_fifo') {
                        neededForks.push(leftF, rightF);
                    } else {
                        neededForks.push(leftF);
                    }
                }

                neededForks.forEach(reqFork => {
                    if (isForkAdjacentToPhilosopher(reqFork, p)) {
                        const fCoord = getForkCoordinates(reqFork);
                        svgHtml += `
                            <line x1="${pCoord.x}" y1="${pCoord.y}" x2="${fCoord.x}" y2="${fCoord.y}"
                                  stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="5,4"
                                  filter="drop-shadow(0 0 6px rgba(245, 158, 11, 0.7))">
                                <animate attributeName="stroke-dashoffset" values="18;0" dur="0.8s" repeatCount="indefinite" />
                            </line>
                        `;
                    }
                });
            }
        }
    }

    // =========================================================================
    // LAYER 4: Deadlock Circular Wait Cycle (Animated Pulsing Red Lines)
    // Visualizes Coffman circular wait chain:
    // P0 -> F1 -> P1 -> F2 -> P2 -> F3 -> P3 -> F4 -> P4 -> F0 -> P0
    // =========================================================================
    if (appState.deadlock.detected) {
        for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
            const p1 = getPhilCoordinates(i);
            const neededRightFork = (i + 1) % NUM_PHILOSOPHERS;
            const fCoord = getForkCoordinates(neededRightFork);

            // Reaching for right fork held by neighbor
            svgHtml += `
                <line x1="${p1.x}" y1="${p1.y}" x2="${fCoord.x}" y2="${fCoord.y}"
                      stroke="#ef4444" stroke-width="3" stroke-dasharray="6,4"
                      filter="drop-shadow(0 0 8px rgba(239, 68, 68, 0.9))">
                    <animate attributeName="stroke-dashoffset" values="20;0" dur="0.7s" repeatCount="indefinite" />
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
        if (deadlockCycleBreakdown) deadlockCycleBreakdown.innerHTML = '';
        if (topologyWarningBanner) topologyWarningBanner.style.display = 'none';
    }

    refreshSummaryCards();
    refreshForksUI();
    renderSvgConnections();
}

function refreshForksUI() {
    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
        const fork = appState.forks[i];
        const fNode = document.getElementById(`forkNode_${i}`);
        if (!fNode) continue;

        if (appState.deadlock.detected) {
            fNode.className = 'fork-node deadlocked';
            fNode.innerHTML = `<span class="fork-id">F${i}</span>`;
        } else if (fork.owner !== -1) {
            fNode.className = 'fork-node allocated';
            fNode.innerHTML = `<span class="fork-id">P${fork.owner}</span>`;
        } else {
            // Check if any philosopher is actively requesting fork i
            let isRequested = false;
            for (let p = 0; p < NUM_PHILOSOPHERS; p++) {
                const phil = appState.philosophers[p];
                if (phil.state === 'WAITING' || phil.state === 'HUNGRY') {
                    if (isForkAdjacentToPhilosopher(i, p) && fork.owner !== p) {
                        isRequested = true;
                        break;
                    }
                }
            }

            if (isRequested) {
                fNode.className = 'fork-node requested';
                fNode.innerHTML = `<span class="fork-id">F${i}</span>`;
            } else {
                fNode.className = 'fork-node';
                fNode.innerHTML = `<span class="fork-id">F${i}</span>`;
            }
        }
    }
}

function refreshSummaryCards() {
    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
        const p = appState.philosophers[i];
        const card = document.getElementById(`summaryCard_${i}`);
        const stateLabel = document.getElementById(`summaryState_${i}`);
        const heldLabel = document.getElementById(`summaryHeld_${i}`);
        const needsLabel = document.getElementById(`summaryNeeds_${i}`);
        const mealsLabel = document.getElementById(`summaryMeals_${i}`);

        if (!card) continue;

        const leftF = i;
        const rightF = (i + 1) % NUM_PHILOSOPHERS;
        const held = [];
        if (appState.forks[leftF]?.owner === i) held.push(`F${leftF}`);
        if (appState.forks[rightF]?.owner === i) held.push(`F${rightF}`);

        let needs = 'None';
        if (appState.deadlock.detected) {
            needs = `F${rightF} (held by P${rightF})`;
        } else if (p.state === 'WAITING' || p.state === 'HUNGRY') {
            if (held.includes(`F${leftF}`) && !held.includes(`F${rightF}`)) {
                needs = `F${rightF} (held by P${rightF})`;
            } else if (!held.includes(`F${leftF}`) && held.includes(`F${rightF}`)) {
                needs = `F${leftF} (held by P${(i + 4) % NUM_PHILOSOPHERS})`;
            } else {
                if (appState.algorithm === 'resource_ordering') {
                    needs = `F${Math.min(leftF, rightF)}`;
                } else if (appState.algorithm === 'fair_fifo') {
                    needs = `F${leftF}, F${rightF}`;
                } else {
                    needs = `F${leftF}`;
                }
            }
        }

        if (stateLabel) {
            stateLabel.textContent = p.state;
            stateLabel.style.color = getStateColor(p.state);
        }
        if (heldLabel) heldLabel.textContent = `Held: ${held.length ? held.join(', ') : 'None'}`;
        if (needsLabel) needsLabel.textContent = `Needs: ${needs}`;
        if (mealsLabel) mealsLabel.textContent = `Meals: ${p.mealsCompleted}`;

        let cardClass = 'p-summary-card';
        if (appState.deadlock.detected) cardClass += ' deadlocked';
        else if (p.state === 'EATING') cardClass += ' eating';
        card.className = cardClass;
    }
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

    refreshSummaryCards();
    refreshForksUI();
    renderSvgConnections();
}

function updateForkState(id, owner, available) {
    if (id < 0 || id >= NUM_PHILOSOPHERS) return;

    appState.forks[id].owner = owner;
    appState.forks[id].available = available;

    refreshSummaryCards();
    refreshForksUI();
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
        'Circular Wait Formed: All 5 philosophers hold left fork and wait indefinitely on right fork!';

    if (deadlockCycleBreakdown) {
        deadlockCycleBreakdown.innerHTML = `
            <div class="deadlock-chip">P0 holds F0 <span class="arrow">&rarr;</span> requests F1 (held by P1)</div>
            <div class="deadlock-chip">P1 holds F1 <span class="arrow">&rarr;</span> requests F2 (held by P2)</div>
            <div class="deadlock-chip">P2 holds F2 <span class="arrow">&rarr;</span> requests F3 (held by P3)</div>
            <div class="deadlock-chip">P3 holds F3 <span class="arrow">&rarr;</span> requests F4 (held by P4)</div>
            <div class="deadlock-chip">P4 holds F4 <span class="arrow">&rarr;</span> requests F0 (held by P0)</div>
        `;
    }

    for (let i = 0; i < NUM_PHILOSOPHERS; i++) {
        const node = document.getElementById(`philNode_${i}`);
        if (node) node.className = 'philosopher-node DEADLOCKED';
        const fNode = document.getElementById(`forkNode_${i}`);
        if (fNode) fNode.className = 'fork-node deadlocked';
    }

    refreshSummaryCards();
    refreshForksUI();
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
