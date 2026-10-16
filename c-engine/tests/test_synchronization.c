#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <unistd.h>
#include "types.h"
#include "events.h"
#include "synchronization.h"
#include "philosopher.h"

static int g_tests_passed = 0;
static int g_tests_total = 0;

#define TEST_ASSERT(cond, msg) do { \
    g_tests_total++; \
    if (cond) { \
        printf("  [PASS] %s\n", msg); \
        g_tests_passed++; \
    } else { \
        printf("  [FAIL] %s (Line %d)\n", msg, __LINE__); \
        assert(cond); \
    } \
} while(0)

/* Helper to setup engine */
static void setup_test_engine(simulation_engine_t *engine, algorithm_type_t algo) {
    memset(engine, 0, sizeof(simulation_engine_t));
    engine->config.num_philosophers = 5;
    engine->config.algorithm = algo;
    engine->config.think_time_min_ms = 50;
    engine->config.think_time_max_ms = 100;
    engine->config.eat_time_min_ms = 50;
    engine->config.eat_time_max_ms = 100;
    engine->config.deadlock_demo_mode = false;
    
    engine->status = STATUS_STOPPED;
    engine->is_running = false;
    engine->is_paused = false;
    engine->stop_requested = false;
    
    for (int i = 0; i < 5; i++) {
        engine->philosophers[i].id = i;
        engine->philosophers[i].state = STATE_THINKING;
        engine->philosophers[i].left_fork_id = i;
        engine->philosophers[i].right_fork_id = (i + 1) % 5;
        engine->philosophers[i].meals_completed = 0;
        engine->philosophers[i].total_wait_time_ms = 0;
        engine->philosophers[i].max_wait_time_ms = 0;
        engine->philosophers[i].wait_events_count = 0;
        engine->philosophers[i].thread_active = false;
        
        engine->forks[i].id = i;
        engine->forks[i].owner_id = -1;
        engine->forks[i].is_available = true;
    }
    
    sync_init(engine);
}

static void teardown_test_engine(simulation_engine_t *engine) {
    engine->stop_requested = true;
    sync_unlock_all_for_shutdown(engine);
    for (int i = 0; i < 5; i++) {
        if (engine->philosophers[i].thread_active) {
            pthread_join(engine->philosophers[i].thread, NULL);
            engine->philosophers[i].thread_active = false;
        }
    }
    sync_cleanup(engine);
}

/* Test 1: Fork mutual exclusion invariant */
static void test_fork_mutual_exclusion(void) {
    printf("\n=== Running Test 1: Fork Mutual Exclusion Invariant ===\n");
    simulation_engine_t engine;
    setup_test_engine(&engine, ALGO_RESOURCE_ORDERING);
    
    /* Philosopher 0 acquires forks 0 and 1 */
    bool ok0 = sync_acquire_forks(&engine, 0);
    TEST_ASSERT(ok0 == true, "Philosopher 0 acquired forks 0 and 1");
    TEST_ASSERT(engine.forks[0].owner_id == 0, "Fork 0 is owned by Philosopher 0");
    TEST_ASSERT(engine.forks[1].owner_id == 0, "Fork 1 is owned by Philosopher 0");
    TEST_ASSERT(engine.forks[0].is_available == false, "Fork 0 is marked unavailable");
    TEST_ASSERT(engine.forks[1].is_available == false, "Fork 1 is marked unavailable");
    
    /* Philosopher 1 attempts to acquire forks 1 and 2: Fork 1 is taken! */
    /* In non-blocking trylock test, fork 1 cannot be acquired by Philosopher 1 */
    int trylock_res = pthread_mutex_trylock(&engine.forks[1].mutex);
    TEST_ASSERT(trylock_res != 0, "Fork 1 cannot be acquired simultaneously by another thread");
    
    /* Release forks */
    sync_release_forks(&engine, 0);
    TEST_ASSERT(engine.forks[0].owner_id == -1, "Fork 0 released and unowned");
    TEST_ASSERT(engine.forks[1].owner_id == -1, "Fork 1 released and unowned");
    TEST_ASSERT(engine.forks[0].is_available == true, "Fork 0 marked available");
    TEST_ASSERT(engine.forks[1].is_available == true, "Fork 1 marked available");
    
    teardown_test_engine(&engine);
}

/* Test 2: Resource Ordering prevents deadlock and allows progress */
static void test_resource_ordering_progress(void) {
    printf("\n=== Running Test 2: Resource Ordering Progress ===\n");
    simulation_engine_t engine;
    setup_test_engine(&engine, ALGO_RESOURCE_ORDERING);
    engine.is_running = true;
    
    /* Start all 5 philosopher threads */
    for (int i = 0; i < 5; i++) {
        philosopher_args_t *args = (philosopher_args_t*)malloc(sizeof(philosopher_args_t));
        args->engine = &engine;
        args->id = i;
        engine.philosophers[i].thread_active = true;
        pthread_create(&engine.philosophers[i].thread, NULL, philosopher_thread_func, args);
    }
    
    /* Let threads run for 1.5 seconds */
    usleep(1500000);
    
    /* Stop engine */
    teardown_test_engine(&engine);
    
    int total_meals = 0;
    for (int i = 0; i < 5; i++) {
        total_meals += engine.philosophers[i].meals_completed;
        printf("  Philosopher %d completed %d meals\n", i, engine.philosophers[i].meals_completed);
        TEST_ASSERT(engine.philosophers[i].meals_completed > 0, "Philosopher completed at least 1 meal");
    }
    TEST_ASSERT(total_meals >= 5, "Total meals >= 5 in 1.5s execution without deadlock");
}

/* Test 3: Controlled Deadlock Demonstration and Circular Wait Detection */
static void test_deadlock_demonstration(void) {
    printf("\n=== Running Test 3: Controlled Deadlock Demonstration ===\n");
    simulation_engine_t engine;
    setup_test_engine(&engine, ALGO_NAIVE_LEFT_FIRST);
    engine.config.deadlock_demo_mode = true;
    engine.is_running = true;
    
    /* Start all 5 philosopher threads in demo mode */
    for (int i = 0; i < 5; i++) {
        philosopher_args_t *args = (philosopher_args_t*)malloc(sizeof(philosopher_args_t));
        args->engine = &engine;
        args->id = i;
        engine.philosophers[i].thread_active = true;
        pthread_create(&engine.philosophers[i].thread, NULL, philosopher_thread_func, args);
    }
    
    /* Wait for barrier and circular wait to settle (within 500ms) */
    bool deadlock_found = false;
    for (int step = 0; step < 20; step++) {
        usleep(50000); /* 50ms */
        if (sync_check_deadlock(&engine)) {
            deadlock_found = true;
            break;
        }
    }
    
    TEST_ASSERT(deadlock_found == true, "Deadlock detector confirmed circular wait across all 5 philosophers");
    TEST_ASSERT(engine.deadlock_detected == true, "Engine state flagged as deadlock_detected");
    TEST_ASSERT(engine.status == STATUS_DEADLOCKED, "Engine status transitioned to STATUS_DEADLOCKED");
    TEST_ASSERT(engine.deadlock_cycle_length == 5, "Circular wait cycle length is 5");
    
    /* Verify safe shutdown does not hang */
    teardown_test_engine(&engine);
    TEST_ASSERT(engine.is_running == false || engine.stop_requested == true, "Deadlocked engine stopped safely without hanging");
}

/* Test 4: Fair FIFO Synchronization prevents starvation */
static void test_fair_fifo_synchronization(void) {
    printf("\n=== Running Test 4: Fair FIFO Synchronization ===\n");
    simulation_engine_t engine;
    setup_test_engine(&engine, ALGO_FAIR_FIFO);
    engine.is_running = true;
    
    for (int i = 0; i < 5; i++) {
        philosopher_args_t *args = (philosopher_args_t*)malloc(sizeof(philosopher_args_t));
        args->engine = &engine;
        args->id = i;
        engine.philosophers[i].thread_active = true;
        pthread_create(&engine.philosophers[i].thread, NULL, philosopher_thread_func, args);
    }
    
    /* Run for 2 seconds */
    usleep(2000000);
    
    teardown_test_engine(&engine);
    
    int min_meals = 999999;
    int max_meals = 0;
    for (int i = 0; i < 5; i++) {
        int m = engine.philosophers[i].meals_completed;
        if (m < min_meals) min_meals = m;
        if (m > max_meals) max_meals = m;
        printf("  Philosopher %d: %d meals, avg wait: %.1f ms, max wait: %llu ms\n",
               i, m,
               engine.philosophers[i].wait_events_count ? (double)engine.philosophers[i].total_wait_time_ms / engine.philosophers[i].wait_events_count : 0.0,
               (unsigned long long)engine.philosophers[i].max_wait_time_ms);
        TEST_ASSERT(m > 0, "Philosopher received meal under Fair FIFO policy");
    }
    
    /* Check meal distribution fairness: variance should be bounded */
    int spread = max_meals - min_meals;
    printf("  Meal count spread (max - min): %d\n", spread);
    TEST_ASSERT(spread <= 5, "Fair FIFO keeps meal disparity low (no starvation)");
}

int main(void) {
    events_init();
    printf("====================================================\n");
    printf("OCTO_OSSP Dining Philosophers C Synchronization Tests\n");
    printf("====================================================\n");
    
    test_fork_mutual_exclusion();
    test_resource_ordering_progress();
    test_deadlock_demonstration();
    test_fair_fifo_synchronization();
    
    printf("\n====================================================\n");
    printf("Test Results: %d / %d assertions passed (%s)\n",
           g_tests_passed, g_tests_total,
           (g_tests_passed == g_tests_total) ? "ALL TESTS PASSED" : "FAILURES OCCURRED");
    printf("====================================================\n");
    
    events_destroy();
    return (g_tests_passed == g_tests_total) ? 0 : 1;
}
