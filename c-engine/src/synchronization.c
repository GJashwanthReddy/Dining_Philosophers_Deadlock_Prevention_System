#include "synchronization.h"
#include "events.h"
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>

void sync_init(simulation_engine_t *engine) {
    pthread_mutex_init(&engine->state_mutex, NULL);
    pthread_cond_init(&engine->pause_cond, NULL);
    pthread_mutex_init(&engine->monitor_mutex, NULL);
    
    int n = engine->config.num_philosophers;
    for (int i = 0; i < n; i++) {
        pthread_mutex_init(&engine->forks[i].mutex, NULL);
        engine->forks[i].id = i;
        engine->forks[i].owner_id = -1;
        engine->forks[i].is_available = true;
        
        pthread_cond_init(&engine->can_eat_cond[i], NULL);
    }
    
    engine->fifo_head = NULL;
    engine->fifo_tail = NULL;
    
    pthread_barrier_init(&engine->deadlock_barrier, NULL, n);
    engine->deadlock_barrier_active = true;
    engine->deadlock_detected = false;
    engine->deadlock_cycle_length = 0;
}

void sync_cleanup(simulation_engine_t *engine) {
    int n = engine->config.num_philosophers;
    
    pthread_mutex_destroy(&engine->state_mutex);
    pthread_cond_destroy(&engine->pause_cond);
    pthread_mutex_destroy(&engine->monitor_mutex);
    
    for (int i = 0; i < n; i++) {
        pthread_mutex_destroy(&engine->forks[i].mutex);
        pthread_cond_destroy(&engine->can_eat_cond[i]);
    }
    
    if (engine->deadlock_barrier_active) {
        pthread_barrier_destroy(&engine->deadlock_barrier);
        engine->deadlock_barrier_active = false;
    }
    
    /* Clean up any residual FIFO queue nodes */
    fifo_node_t *curr = engine->fifo_head;
    while (curr != NULL) {
        fifo_node_t *next = curr->next;
        free(curr);
        curr = next;
    }
    engine->fifo_head = NULL;
    engine->fifo_tail = NULL;
}

/* ========================================================================= */
/* ALGORITHM 1: NAIVE LEFT-FIRST APPROACH                                    */
/* ========================================================================= */

bool sync_naive_acquire_forks(simulation_engine_t *engine, int philosopher_id) {
    int left = engine->philosophers[philosopher_id].left_fork_id;
    int right = engine->philosophers[philosopher_id].right_fork_id;
    
    if (engine->config.deadlock_demo_mode) {
        /* Phase 1: Acquire left fork */
        pthread_mutex_lock(&engine->forks[left].mutex);
        engine->forks[left].owner_id = philosopher_id;
        engine->forks[left].is_available = false;
        events_emit_fork_state(left, philosopher_id, false);
        events_emit_log("info", "Philosopher %d acquired left fork %d (Demo: holding 1 of 2)", philosopher_id, left);
        
        /* Update state to WAITING */
        pthread_mutex_lock(&engine->state_mutex);
        engine->philosophers[philosopher_id].state = STATE_WAITING;
        events_emit_philosopher_state(philosopher_id, STATE_WAITING,
                                      engine->philosophers[philosopher_id].meals_completed,
                                      get_current_time_ms() - engine->philosophers[philosopher_id].hungry_start_time_ms);
        pthread_mutex_unlock(&engine->state_mutex);
        
        /* Phase 2: Synchronize at barrier so ALL 5 philosophers hold left fork */
        events_emit_log("warn", "Philosopher %d waiting at synchronization barrier...", philosopher_id);
        pthread_barrier_wait(&engine->deadlock_barrier);
        
        /* Phase 3: Now all 5 attempt to acquire their right fork concurrently */
        events_emit_log("warn", "Philosopher %d attempting to acquire right fork %d (CIRCULAR WAIT)", philosopher_id, right);
        
        /* Use a responsive polling loop on right fork so engine can stop cleanly */
        while (!engine->stop_requested) {
            if (pthread_mutex_trylock(&engine->forks[right].mutex) == 0) {
                engine->forks[right].owner_id = philosopher_id;
                engine->forks[right].is_available = false;
                events_emit_fork_state(right, philosopher_id, false);
                events_emit_log("info", "Philosopher %d acquired right fork %d", philosopher_id, right);
                return true;
            }
            usleep(20000); /* 20ms polling interval to allow stop/pause */
        }
        
        /* If stop was requested while blocked, release left fork cleanly */
        engine->forks[left].owner_id = -1;
        engine->forks[left].is_available = true;
        events_emit_fork_state(left, -1, true);
        pthread_mutex_unlock(&engine->forks[left].mutex);
        return false;
    }
    
    /* Normal (non-demo) Naive mode: acquire left, then right with cancel check */
    while (!engine->stop_requested) {
        if (pthread_mutex_trylock(&engine->forks[left].mutex) == 0) {
            engine->forks[left].owner_id = philosopher_id;
            engine->forks[left].is_available = false;
            events_emit_fork_state(left, philosopher_id, false);
            events_emit_log("info", "Philosopher %d acquired left fork %d", philosopher_id, left);
            break;
        }
        usleep(10000);
    }
    if (engine->stop_requested) return false;
    
    /* Transition to WAITING while waiting for right fork */
    pthread_mutex_lock(&engine->state_mutex);
    engine->philosophers[philosopher_id].state = STATE_WAITING;
    events_emit_philosopher_state(philosopher_id, STATE_WAITING,
                                  engine->philosophers[philosopher_id].meals_completed,
                                  get_current_time_ms() - engine->philosophers[philosopher_id].hungry_start_time_ms);
    pthread_mutex_unlock(&engine->state_mutex);
    
    while (!engine->stop_requested) {
        if (pthread_mutex_trylock(&engine->forks[right].mutex) == 0) {
            engine->forks[right].owner_id = philosopher_id;
            engine->forks[right].is_available = false;
            events_emit_fork_state(right, philosopher_id, false);
            events_emit_log("info", "Philosopher %d acquired right fork %d", philosopher_id, right);
            return true;
        }
        usleep(10000);
    }
    
    /* Cleanup if stopped */
    engine->forks[left].owner_id = -1;
    engine->forks[left].is_available = true;
    events_emit_fork_state(left, -1, true);
    pthread_mutex_unlock(&engine->forks[left].mutex);
    return false;
}

void sync_naive_release_forks(simulation_engine_t *engine, int philosopher_id) {
    int left = engine->philosophers[philosopher_id].left_fork_id;
    int right = engine->philosophers[philosopher_id].right_fork_id;
    
    if (engine->forks[right].owner_id == philosopher_id) {
        engine->forks[right].owner_id = -1;
        engine->forks[right].is_available = true;
        events_emit_fork_state(right, -1, true);
        pthread_mutex_unlock(&engine->forks[right].mutex);
    }
    
    if (engine->forks[left].owner_id == philosopher_id) {
        engine->forks[left].owner_id = -1;
        engine->forks[left].is_available = true;
        events_emit_fork_state(left, -1, true);
        pthread_mutex_unlock(&engine->forks[left].mutex);
    }
    
    events_emit_log("info", "Philosopher %d released forks %d and %d", philosopher_id, left, right);
}

/* ========================================================================= */
/* ALGORITHM 2: RESOURCE ORDERING (GLOBAL HIERARCHY)                         */
/* ========================================================================= */

bool sync_resource_ordering_acquire_forks(simulation_engine_t *engine, int philosopher_id) {
    int left = engine->philosophers[philosopher_id].left_fork_id;
    int right = engine->philosophers[philosopher_id].right_fork_id;
    
    /* Strict global order: acquire lower index first, higher index second */
    int first = (left < right) ? left : right;
    int second = (left > right) ? left : right;
    
    /* Acquire first (lower index) fork */
    while (!engine->stop_requested) {
        if (pthread_mutex_trylock(&engine->forks[first].mutex) == 0) {
            engine->forks[first].owner_id = philosopher_id;
            engine->forks[first].is_available = false;
            events_emit_fork_state(first, philosopher_id, false);
            events_emit_log("info", "Philosopher %d acquired lower-indexed fork %d", philosopher_id, first);
            break;
        }
        usleep(5000);
    }
    if (engine->stop_requested) return false;
    
    /* Philosopher holds first fork, now waits for second */
    pthread_mutex_lock(&engine->state_mutex);
    engine->philosophers[philosopher_id].state = STATE_WAITING;
    events_emit_philosopher_state(philosopher_id, STATE_WAITING,
                                  engine->philosophers[philosopher_id].meals_completed,
                                  get_current_time_ms() - engine->philosophers[philosopher_id].hungry_start_time_ms);
    pthread_mutex_unlock(&engine->state_mutex);
    
    /* Acquire second (higher index) fork */
    while (!engine->stop_requested) {
        if (pthread_mutex_trylock(&engine->forks[second].mutex) == 0) {
            engine->forks[second].owner_id = philosopher_id;
            engine->forks[second].is_available = false;
            events_emit_fork_state(second, philosopher_id, false);
            events_emit_log("info", "Philosopher %d acquired higher-indexed fork %d (Ready to eat)", philosopher_id, second);
            return true;
        }
        usleep(5000);
    }
    
    /* Stop requested: release first fork cleanly */
    engine->forks[first].owner_id = -1;
    engine->forks[first].is_available = true;
    events_emit_fork_state(first, -1, true);
    pthread_mutex_unlock(&engine->forks[first].mutex);
    return false;
}

void sync_resource_ordering_release_forks(simulation_engine_t *engine, int philosopher_id) {
    int left = engine->philosophers[philosopher_id].left_fork_id;
    int right = engine->philosophers[philosopher_id].right_fork_id;
    
    int first = (left < right) ? left : right;
    int second = (left > right) ? left : right;
    
    /* Release in reverse order of acquisition */
    if (engine->forks[second].owner_id == philosopher_id) {
        engine->forks[second].owner_id = -1;
        engine->forks[second].is_available = true;
        events_emit_fork_state(second, -1, true);
        pthread_mutex_unlock(&engine->forks[second].mutex);
    }
    
    if (engine->forks[first].owner_id == philosopher_id) {
        engine->forks[first].owner_id = -1;
        engine->forks[first].is_available = true;
        events_emit_fork_state(first, -1, true);
        pthread_mutex_unlock(&engine->forks[first].mutex);
    }
    
    events_emit_log("info", "Philosopher %d released forks %d and %d (Resource ordering)", philosopher_id, second, first);
}

/* ========================================================================= */
/* ALGORITHM 3: FAIR FIFO SYNCHRONIZATION (STARVATION-FREE MONITOR)         */
/* ========================================================================= */

/* Internal helper: checks if philosopher can eat under FIFO rules */
static bool can_philosopher_eat_fifo_unlocked(simulation_engine_t *engine, int philosopher_id) {
    int left = engine->philosophers[philosopher_id].left_fork_id;
    int right = engine->philosophers[philosopher_id].right_fork_id;
    
    /* 1. Both forks must be free */
    if (!engine->forks[left].is_available || !engine->forks[right].is_available) {
        return false;
    }
    
    /* 2. Fairness rule: No earlier waiting philosopher in FIFO queue competing for left or right */
    for (fifo_node_t *node = engine->fifo_head; node != NULL; node = node->next) {
        if (node->philosopher_id == philosopher_id) {
            /* Reached self without finding earlier conflicting requests */
            break;
        }
        int other_left = engine->philosophers[node->philosopher_id].left_fork_id;
        int other_right = engine->philosophers[node->philosopher_id].right_fork_id;
        
        /* If an earlier philosopher needs our left or right fork, yield priority to them */
        if (other_left == left || other_left == right || other_right == left || other_right == right) {
            return false;
        }
    }
    
    return true;
}

bool sync_fair_fifo_acquire_forks(simulation_engine_t *engine, int philosopher_id) {
    pthread_mutex_lock(&engine->monitor_mutex);
    
    /* Enqueue this philosopher to the FIFO arrival queue */
    fifo_node_t *new_node = (fifo_node_t*)malloc(sizeof(fifo_node_t));
    new_node->philosopher_id = philosopher_id;
    new_node->request_time_ms = get_current_time_ms();
    new_node->next = NULL;
    
    if (engine->fifo_tail == NULL) {
        engine->fifo_head = new_node;
        engine->fifo_tail = new_node;
    } else {
        engine->fifo_tail->next = new_node;
        engine->fifo_tail = new_node;
    }
    
    events_emit_log("info", "Philosopher %d enqueued in FIFO fair admission queue", philosopher_id);
    
    /* Update state to WAITING */
    pthread_mutex_lock(&engine->state_mutex);
    engine->philosophers[philosopher_id].state = STATE_WAITING;
    events_emit_philosopher_state(philosopher_id, STATE_WAITING,
                                  engine->philosophers[philosopher_id].meals_completed,
                                  get_current_time_ms() - engine->philosophers[philosopher_id].hungry_start_time_ms);
    pthread_mutex_unlock(&engine->state_mutex);
    
    /* Wait until forks are free AND fairness policy admits this philosopher */
    while (!engine->stop_requested && !can_philosopher_eat_fifo_unlocked(engine, philosopher_id)) {
        pthread_cond_wait(&engine->can_eat_cond[philosopher_id], &engine->monitor_mutex);
    }
    
    if (engine->stop_requested) {
        /* Dequeue node on cancellation */
        fifo_node_t *prev = NULL;
        fifo_node_t *curr = engine->fifo_head;
        while (curr != NULL) {
            if (curr->philosopher_id == philosopher_id) {
                if (prev == NULL) engine->fifo_head = curr->next;
                else prev->next = curr->next;
                if (engine->fifo_tail == curr) engine->fifo_tail = prev;
                free(curr);
                break;
            }
            prev = curr;
            curr = curr->next;
        }
        pthread_mutex_unlock(&engine->monitor_mutex);
        return false;
    }
    
    /* Dequeue node as admission is granted */
    fifo_node_t *prev = NULL;
    fifo_node_t *curr = engine->fifo_head;
    while (curr != NULL) {
        if (curr->philosopher_id == philosopher_id) {
            if (prev == NULL) engine->fifo_head = curr->next;
            else prev->next = curr->next;
            if (engine->fifo_tail == curr) engine->fifo_tail = prev;
            free(curr);
            break;
        }
        prev = curr;
        curr = curr->next;
    }
    
    /* Claim both forks under monitor lock */
    int left = engine->philosophers[philosopher_id].left_fork_id;
    int right = engine->philosophers[philosopher_id].right_fork_id;
    
    engine->forks[left].owner_id = philosopher_id;
    engine->forks[left].is_available = false;
    engine->forks[right].owner_id = philosopher_id;
    engine->forks[right].is_available = false;
    
    events_emit_fork_state(left, philosopher_id, false);
    events_emit_fork_state(right, philosopher_id, false);
    events_emit_log("info", "Fair FIFO Admission granted to Philosopher %d (both forks %d, %d allocated)",
                    philosopher_id, left, right);
                    
    pthread_mutex_unlock(&engine->monitor_mutex);
    return true;
}

void sync_fair_fifo_release_forks(simulation_engine_t *engine, int philosopher_id) {
    pthread_mutex_lock(&engine->monitor_mutex);
    
    int left = engine->philosophers[philosopher_id].left_fork_id;
    int right = engine->philosophers[philosopher_id].right_fork_id;
    
    engine->forks[left].owner_id = -1;
    engine->forks[left].is_available = true;
    engine->forks[right].owner_id = -1;
    engine->forks[right].is_available = true;
    
    events_emit_fork_state(left, -1, true);
    events_emit_fork_state(right, -1, true);
    events_emit_log("info", "Philosopher %d finished meal, released forks %d, %d (Fair FIFO)",
                    philosopher_id, left, right);
    
    /* Wake up waiting philosophers in the FIFO queue so admission can re-evaluate */
    for (fifo_node_t *node = engine->fifo_head; node != NULL; node = node->next) {
        pthread_cond_signal(&engine->can_eat_cond[node->philosopher_id]);
    }
    
    pthread_mutex_unlock(&engine->monitor_mutex);
}

/* ========================================================================= */
/* DISPATCHER & DEADLOCK DETECTION                                          */
/* ========================================================================= */

bool sync_acquire_forks(simulation_engine_t *engine, int philosopher_id) {
    switch (engine->config.algorithm) {
        case ALGO_NAIVE_LEFT_FIRST:
            return sync_naive_acquire_forks(engine, philosopher_id);
        case ALGO_RESOURCE_ORDERING:
            return sync_resource_ordering_acquire_forks(engine, philosopher_id);
        case ALGO_FAIR_FIFO:
            return sync_fair_fifo_acquire_forks(engine, philosopher_id);
        default:
            return sync_naive_acquire_forks(engine, philosopher_id);
    }
}

void sync_release_forks(simulation_engine_t *engine, int philosopher_id) {
    switch (engine->config.algorithm) {
        case ALGO_NAIVE_LEFT_FIRST:
            sync_naive_release_forks(engine, philosopher_id);
            break;
        case ALGO_RESOURCE_ORDERING:
            sync_resource_ordering_release_forks(engine, philosopher_id);
            break;
        case ALGO_FAIR_FIFO:
            sync_fair_fifo_release_forks(engine, philosopher_id);
            break;
        default:
            sync_naive_release_forks(engine, philosopher_id);
            break;
    }
}

bool sync_check_deadlock(simulation_engine_t *engine) {
    if (engine->deadlock_detected) return true;
    
    int n = engine->config.num_philosophers;
    int waiting_with_one_fork_count = 0;
    
    /* In circular wait, all 5 philosophers hold left fork (fork i) and are waiting for right fork */
    for (int i = 0; i < n; i++) {
        int left = engine->philosophers[i].left_fork_id;
        if (engine->philosophers[i].state == STATE_WAITING &&
            engine->forks[left].owner_id == i) {
            waiting_with_one_fork_count++;
        }
    }
    
    if (waiting_with_one_fork_count == n) {
        engine->deadlock_detected = true;
        engine->status = STATUS_DEADLOCKED;
        engine->deadlock_cycle_length = n;
        for (int i = 0; i < n; i++) {
            engine->deadlock_cycle[i] = i;
        }
        
        events_emit_status(STATUS_DEADLOCKED, engine->config.algorithm, "Deadlock confirmed: Circular wait cycle established.");
        events_emit_deadlock(engine->deadlock_cycle, n,
                             "DEADLOCK DETECTED: Coffman conditions verified (1. Mutual Exclusion on forks, 2. Hold & Wait active, 3. No Preemption, 4. Circular Wait: P0->F1->P1->F2->P2->F3->P3->F4->P4->F0->P0).");
        events_emit_log("error", "DEADLOCK DETECTED! All %d philosophers are deadlocked in circular wait.", n);
        return true;
    }
    
    return false;
}

void sync_unlock_all_for_shutdown(simulation_engine_t *engine) {
    int n = engine->config.num_philosophers;
    for (int i = 0; i < n; i++) {
        if (engine->forks[i].owner_id != -1) {
            engine->forks[i].owner_id = -1;
            engine->forks[i].is_available = true;
            pthread_mutex_unlock(&engine->forks[i].mutex);
        }
        pthread_cond_broadcast(&engine->can_eat_cond[i]);
    }
    pthread_cond_broadcast(&engine->pause_cond);
}

bool sync_is_fork_adjacent(int philosopher_id, int fork_id, int num_philosophers) {
    if (philosopher_id < 0 || philosopher_id >= num_philosophers) return false;
    int left = philosopher_id;
    int right = (philosopher_id + 1) % num_philosophers;
    return (fork_id == left || fork_id == right);
}

bool sync_validate_topology(const simulation_engine_t *engine) {
    if (!engine) return false;
    int n = engine->config.num_philosophers;
    if (n != DEFAULT_NUM_PHILOSOPHERS) return false;

    for (int i = 0; i < n; i++) {
        int left = engine->philosophers[i].left_fork_id;
        int right = engine->philosophers[i].right_fork_id;

        /* Invariant 1: Left fork must equal philosopher ID i */
        if (left != i) return false;

        /* Invariant 2: Right fork must equal (i + 1) % n */
        if (right != (i + 1) % n) return false;

        /* Invariant 3: Left and right forks must be distinct */
        if (left == right) return false;

        /* Invariant 4: Both forks must be adjacent */
        if (!sync_is_fork_adjacent(i, left, n) || !sync_is_fork_adjacent(i, right, n)) {
            return false;
        }

        /* Invariant 5: If a fork is currently owned, owner must be an adjacent philosopher */
        if (engine->forks[i].owner_id != -1) {
            int owner = engine->forks[i].owner_id;
            if (!sync_is_fork_adjacent(owner, i, n)) {
                return false;
            }
        }
    }
    return true;
}

