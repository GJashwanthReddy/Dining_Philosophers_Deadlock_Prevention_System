const express = require('express');
const router = express.Router();
const engineManager = require('../services/engine_manager');

// GET /api/status
router.get('/status', (req, res) => {
    res.json(engineManager.getSnapshot());
});

// POST /api/command
router.post('/command', (req, res) => {
    const { command, algorithm, thinkMin, thinkMax, eatMin, eatMax } = req.body;

    if (!command) {
        return res.status(400).json({ error: 'Command string or object is required' });
    }

    let cmdStr = '';
    const cmdUpper = command.toUpperCase();

    if (cmdUpper === 'START') {
        const algo = algorithm || engineManager.state.algorithm;
        cmdStr = `START ${algo}`;
    } else if (cmdUpper === 'DEMO_DEADLOCK' || cmdUpper === 'DEADLOCK_DEMO') {
        cmdStr = `DEMO_DEADLOCK`;
    } else if (cmdUpper === 'PAUSE') {
        cmdStr = 'PAUSE';
    } else if (cmdUpper === 'RESUME') {
        cmdStr = 'RESUME';
    } else if (cmdUpper === 'STOP') {
        cmdStr = 'STOP';
    } else if (cmdUpper === 'RESET') {
        cmdStr = 'RESET';
    } else if (cmdUpper === 'CONFIG') {
        const tmin = parseInt(thinkMin, 10) || 800;
        const tmax = parseInt(thinkMax, 10) || 1600;
        const emin = parseInt(eatMin, 10) || 800;
        const emax = parseInt(eatMax, 10) || 1600;
        cmdStr = `CONFIG ${tmin} ${tmax} ${emin} ${emax}`;
    } else if (cmdUpper === 'SNAPSHOT') {
        cmdStr = 'SNAPSHOT';
    } else {
        cmdStr = command;
    }

    engineManager.sendCommand(cmdStr);
    res.json({ success: true, commandSent: cmdStr });
});

// GET /api/algorithms
router.get('/algorithms', (req, res) => {
    res.json({
        algorithms: [
            {
                id: 'naive_left_first',
                name: 'Naive Left-First Approach',
                description: 'Baseline educational strategy where every philosopher acquires their left fork first, then right fork.',
                deadlockRisk: 'High (Under simultaneous request, circular wait forms: P0->F1, P1->F2, P2->F3, P3->F4, P4->F0).',
                starvationRisk: 'Moderate to High.',
                concurrencyEfficiency: 'Moderate under light load; halts completely under deadlock.'
            },
            {
                id: 'resource_ordering',
                name: 'Resource Ordering (Dijkstra Hierarchy)',
                description: 'Enforces a strict global ordering rule: every philosopher acquires min(left, right) fork first, then max(left, right) fork.',
                deadlockRisk: 'Zero (Mathematically breaks Coffman Condition 4 - Circular Wait; resource allocation graph is a DAG).',
                starvationRisk: 'Low (Fair scheduling by OS pthread scheduler under finite eating time).',
                concurrencyEfficiency: 'High (Up to 2 philosophers can dine simultaneously without conflict).'
            },
            {
                id: 'fair_fifo',
                name: 'Fair FIFO Monitor Synchronization',
                description: 'Monitor-based admission controller with arrival queue. Conflicting philosophers are admitted strictly in FIFO arrival order.',
                deadlockRisk: 'Zero (Atomic monitor evaluation prevents uncoordinated hold-and-wait).',
                starvationRisk: 'Zero (Guaranteed starvation-freedom under finite eating periods; bounded waiting queue).',
                concurrencyEfficiency: 'Optimal fairness-preserving concurrency.'
            }
        ]
    });
});

module.exports = router;
