const assert = require('assert');
const path = require('path');
const engineManager = require('../server/services/engine_manager');

console.log('================================================================');
console.log('OCTO_OSSP End-to-End C Engine & Communication Integration Tests');
console.log('================================================================\n');

let testsPassed = 0;
let testsTotal = 0;

function it(desc, fn) {
    testsTotal++;
    return fn().then(() => {
        console.log(`  [PASS] ${desc}`);
        testsPassed++;
    }).catch(err => {
        console.error(`  [FAIL] ${desc}`);
        console.error('   ', err.message);
        throw err;
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    try {
        // Test 1: Engine initialization
        await it('1. EngineManager starts C process and emits snapshot', async () => {
            engineManager.startEngine();
            await sleep(1000);
            const snapshot = engineManager.getSnapshot();
            assert.strictEqual(snapshot.type, 'snapshot');
            assert.strictEqual(snapshot.data.numPhilosophers, 5);
            assert.strictEqual(snapshot.data.forks.length, 5);
            assert.strictEqual(snapshot.data.philosophers.length, 5);
        });

        // Test 2: Start Resource Ordering simulation
        await it('2. START command with Resource Ordering runs concurrent threads and serves meals', async () => {
            engineManager.sendCommand('START resource_ordering');
            await sleep(2000);
            const snapshot = engineManager.getSnapshot();
            assert.strictEqual(snapshot.data.status, 'RUNNING');
            assert.strictEqual(snapshot.data.algorithm, 'resource_ordering');
            assert.ok(snapshot.data.metrics.totalMeals > 0, `Expected totalMeals > 0, got ${snapshot.data.metrics.totalMeals}`);

            // Verify fork exclusivity invariant
            const forks = snapshot.data.forks;
            const claimed = {};
            forks.forEach(f => {
                if (!f.available) {
                    assert.ok(f.owner >= 0 && f.owner < 5, `Invalid fork owner: ${f.owner}`);
                    assert.ok(!claimed[f.id], `Fork ${f.id} claimed multiple times!`);
                    claimed[f.id] = f.owner;
                }
            });
        });

        // Test 3: Pause and Resume
        await it('3. PAUSE halts state progression and RESUME continues safely', async () => {
            engineManager.sendCommand('PAUSE');
            await sleep(600);
            let snapshot = engineManager.getSnapshot();
            assert.strictEqual(snapshot.data.status, 'PAUSED');
            const mealsAtPause = snapshot.data.metrics.totalMeals;

            await sleep(600);
            snapshot = engineManager.getSnapshot();
            assert.strictEqual(snapshot.data.metrics.totalMeals, mealsAtPause, 'Meals should not increase while paused');

            engineManager.sendCommand('RESUME');
            await sleep(1000);
            snapshot = engineManager.getSnapshot();
            assert.strictEqual(snapshot.data.status, 'RUNNING');
            assert.ok(snapshot.data.metrics.totalMeals >= mealsAtPause, 'Simulation resumed and progressed');
        });

        // Test 4: Controlled Deadlock Demonstration
        await it('4. DEMO_DEADLOCK establishes circular wait and flags DEADLOCKED state safely', async () => {
            engineManager.sendCommand('DEMO_DEADLOCK');
            await sleep(1500);

            const snapshot = engineManager.getSnapshot();
            assert.strictEqual(snapshot.data.status, 'DEADLOCKED');
            assert.strictEqual(snapshot.data.deadlock.detected, true);
            assert.strictEqual(snapshot.data.deadlock.cycle.length, 5);
            console.log('    Detected circular wait cycle:', snapshot.data.deadlock.cycle);
        });

        // Test 5: Safe recovery and Stop from Deadlock
        await it('5. STOP command safely terminates deadlock and frees resources without orphan processes', async () => {
            engineManager.sendCommand('STOP');
            await sleep(800);
            const snapshot = engineManager.getSnapshot();
            assert.strictEqual(snapshot.data.status, 'STOPPED');
            assert.strictEqual(snapshot.data.deadlock.detected, false);

            // All forks must be available
            snapshot.data.forks.forEach(f => {
                assert.strictEqual(f.available, true, `Fork ${f.id} should be available after STOP`);
                assert.strictEqual(f.owner, -1, `Fork ${f.id} should have no owner`);
            });
        });

        // Test 6: Fair FIFO Synchronization
        await it('6. Fair FIFO Monitor provides starvation-free dining across all 5 philosophers', async () => {
            engineManager.sendCommand('RESET');
            await sleep(300);
            engineManager.sendCommand('CONFIG 80 150 80 150');
            await sleep(300);
            engineManager.sendCommand('START fair_fifo');
            await sleep(3500);

            const snapshot = engineManager.getSnapshot();
            assert.strictEqual(snapshot.data.status, 'RUNNING');
            assert.strictEqual(snapshot.data.algorithm, 'fair_fifo');

            const meals = snapshot.data.metrics.mealsPerPhilosopher;
            console.log('    Fair FIFO meal distribution:', meals);
            meals.forEach((m, idx) => {
                assert.ok(m > 0, `Philosopher ${idx} should have completed at least 1 meal under fair queue`);
            });

            const spread = Math.max(...meals) - Math.min(...meals);
            assert.ok(spread <= 4, `Fair FIFO meal spread should remain small (no starvation), got ${spread}`);
        });

        // Test 7: Clean teardown
        await it('7. RESET and Stop cleanly shuts down engine', async () => {
            engineManager.sendCommand('STOP');
            await sleep(500);
            engineManager.stopEngine();
            await sleep(500);
            assert.strictEqual(engineManager.state.status, 'STOPPED');
        });

        console.log('\n================================================================');
        console.log(`Integration Test Results: ${testsPassed} / ${testsTotal} tests passed!`);
        console.log('================================================================\n');
        process.exit(0);

    } catch (err) {
        console.error('\n[FATAL] Integration test encountered an error:', err);
        engineManager.stopEngine();
        process.exit(1);
    }
}

runTests();
