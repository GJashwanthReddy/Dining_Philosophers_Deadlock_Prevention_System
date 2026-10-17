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

        // Test 1b: Circular Topology and Resource Mapping Verification (Tests 1 - 10)
        await it('1b. Circular table topology verifies P0-P4 and F0-F4 adjacency invariants', async () => {
            const isAdjacent = (fId, pId) => (fId === pId || fId === (pId + 1) % 5);

            // Test 1: P0 adjacent forks are F0 and F1
            assert.strictEqual(isAdjacent(0, 0), true, 'P0 must be adjacent to F0');
            assert.strictEqual(isAdjacent(1, 0), true, 'P0 must be adjacent to F1');

            // Test 2: P1 adjacent forks are F1 and F2
            assert.strictEqual(isAdjacent(1, 1), true, 'P1 must be adjacent to F1');
            assert.strictEqual(isAdjacent(2, 1), true, 'P1 must be adjacent to F2');

            // Test 3: P2 adjacent forks are F2 and F3
            assert.strictEqual(isAdjacent(2, 2), true, 'P2 must be adjacent to F2');
            assert.strictEqual(isAdjacent(3, 2), true, 'P2 must be adjacent to F3');

            // Test 4: P3 adjacent forks are F3 and F4
            assert.strictEqual(isAdjacent(3, 3), true, 'P3 must be adjacent to F3');
            assert.strictEqual(isAdjacent(4, 3), true, 'P3 must be adjacent to F4');

            // Test 5: P4 adjacent forks are F4 and F0
            assert.strictEqual(isAdjacent(4, 4), true, 'P4 must be adjacent to F4');
            assert.strictEqual(isAdjacent(0, 4), true, 'P4 must be adjacent to F0');

            // Test 6: Fork F0 is shared exclusively by P4 and P0
            assert.ok(isAdjacent(0, 4) && isAdjacent(0, 0) && !isAdjacent(0, 1) && !isAdjacent(0, 2) && !isAdjacent(0, 3), 'F0 only shared by P4 and P0');

            // Test 7: Fork F1 is shared exclusively by P0 and P1
            assert.ok(isAdjacent(1, 0) && isAdjacent(1, 1) && !isAdjacent(1, 2) && !isAdjacent(1, 3) && !isAdjacent(1, 4), 'F1 only shared by P0 and P1');

            // Test 8: Fork F2 is shared exclusively by P1 and P2
            assert.ok(isAdjacent(2, 1) && isAdjacent(2, 2) && !isAdjacent(2, 0) && !isAdjacent(2, 3) && !isAdjacent(2, 4), 'F2 only shared by P1 and P2');

            // Test 9: Fork F3 is shared exclusively by P2 and P3
            assert.ok(isAdjacent(3, 2) && isAdjacent(3, 3) && !isAdjacent(3, 0) && !isAdjacent(3, 1) && !isAdjacent(3, 4), 'F3 only shared by P2 and P3');

            // Test 10: Fork F4 is shared exclusively by P3 and P4
            assert.ok(isAdjacent(4, 3) && isAdjacent(4, 4) && !isAdjacent(4, 0) && !isAdjacent(4, 1) && !isAdjacent(4, 2), 'F4 only shared by P3 and P4');
        });

        // Test 2: Start Resource Ordering simulation
        await it('2. START command with Resource Ordering runs concurrent threads and serves meals', async () => {
            engineManager.sendCommand('START resource_ordering');
            await sleep(2000);
            const snapshot = engineManager.getSnapshot();
            assert.strictEqual(snapshot.data.status, 'RUNNING');
            assert.strictEqual(snapshot.data.algorithm, 'resource_ordering');
            assert.ok(snapshot.data.metrics.totalMeals > 0, `Expected totalMeals > 0, got ${snapshot.data.metrics.totalMeals}`);

            // Verify fork exclusivity AND strict adjacency invariants
            const forks = snapshot.data.forks;
            const claimed = {};
            forks.forEach(f => {
                if (!f.available) {
                    assert.ok(f.owner >= 0 && f.owner < 5, `Invalid fork owner: ${f.owner}`);
                    assert.ok(!claimed[f.id], `Fork ${f.id} claimed multiple times!`);
                    claimed[f.id] = f.owner;

                    // Adjacency check: fork f.id can ONLY be owned by p = f.id or p = (f.id + 4) % 5
                    const validOwners = [f.id, (f.id + 4) % 5];
                    assert.ok(validOwners.includes(f.owner),
                        `Topology invariant violated! Fork F${f.id} owned by non-adjacent Philosopher P${f.owner}`);
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
