#include "philosopher.h"
#include "synchronization.h"
#include "events.h"
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int get_random_range(int min_val, int max_val) {
    if (max_val <= min_val) return min_val;
    return min_val + (rand() % (max_val - min_val + 1));
}

void interruptible_sleep_ms(simulation_engine_t *engine, int duration_ms) {
    int elapsed = 0;
    const int step_ms = 20;
    while (elapsed < duration_ms && !engine->stop_requested) {
        /* If paused, wait for resume */
        if (engine->is_paused) {
            pthread_mutex_lock(&engine->state_mutex);
            while (engine->is_paused && !engine->stop_requested) {
                pthread_cond_wait(&engine->pause_cond, &engine->state_mutex);
            }
            pthread_mutex_unlock(&engine->state_mutex);
        }
        
        int sleep_time = (duration_ms - elapsed > step_ms) ? step_ms : (duration_ms - elapsed);
        usleep(sleep_time * 1000);
        elapsed += sleep_time;
    }
}

void* philosopher_thread_func(void *arg) {
    philosopher_args_t *args = (philosopher_args_t*)arg;
    simulation_engine_t *engine = args->engine;
    int id = args->id;
    free(args); /* Allocated in main thread */
    
    events_emit_log("info", "Philosopher thread %d started (left fork: %d, right fork: %d)",
                    id, engine->philosophers[id].left_fork_id, engine->philosophers[id].right_fork_id);
    
    while (!engine->stop_requested) {
        /* Check pause status */
        if (engine->is_paused) {
            pthread_mutex_lock(&engine->state_mutex);
            while (engine->is_paused && !engine->stop_requested) {
                pthread_cond_wait(&engine->pause_cond, &engine->state_mutex);
            }
            pthread_mutex_unlock(&engine->state_mutex);
            if (engine->stop_requested) break;
        }
        
        /* ------------------------------------------------------------- */
        /* 1. THINKING PHASE                                             */
        /* ------------------------------------------------------------- */
        pthread_mutex_lock(&engine->state_mutex);
        engine->philosophers[id].state = STATE_THINKING;
        engine->philosophers[id].state_entered_time_ms = get_current_time_ms();
        events_emit_philosopher_state(id, STATE_THINKING, engine->philosophers[id].meals_completed, 0);
        pthread_mutex_unlock(&engine->state_mutex);
        
        int think_duration = get_random_range(engine->config.think_time_min_ms, engine->config.think_time_max_ms);
        interruptible_sleep_ms(engine, think_duration);
        if (engine->stop_requested) break;
        
        /* ------------------------------------------------------------- */
        /* 2. HUNGRY PHASE                                               */
        /* ------------------------------------------------------------- */
        pthread_mutex_lock(&engine->state_mutex);
        engine->philosophers[id].state = STATE_HUNGRY;
        engine->philosophers[id].state_entered_time_ms = get_current_time_ms();
        engine->philosophers[id].hungry_start_time_ms = engine->philosophers[id].state_entered_time_ms;
        events_emit_philosopher_state(id, STATE_HUNGRY, engine->philosophers[id].meals_completed, 0);
        pthread_mutex_unlock(&engine->state_mutex);
        
        events_emit_log("info", "Philosopher %d is HUNGRY (requesting forks %d and %d)",
                        id, engine->philosophers[id].left_fork_id, engine->philosophers[id].right_fork_id);
        
        /* ------------------------------------------------------------- */
        /* 3. ACQUIRE FORKS (WAITING PHASE MANAGED IN SYNC)              */
        /* ------------------------------------------------------------- */
        bool acquired = sync_acquire_forks(engine, id);
        if (!acquired || engine->stop_requested) {
            break;
        }
        
        /* ------------------------------------------------------------- */
        /* 4. EATING PHASE                                               */
        /* ------------------------------------------------------------- */
        uint64_t now = get_current_time_ms();
        uint64_t wait_duration = now - engine->philosophers[id].hungry_start_time_ms;
        
        pthread_mutex_lock(&engine->state_mutex);
        engine->philosophers[id].state = STATE_EATING;
        engine->philosophers[id].state_entered_time_ms = now;
        engine->philosophers[id].meals_completed++;
        engine->philosophers[id].total_wait_time_ms += wait_duration;
        engine->philosophers[id].wait_events_count++;
        if (wait_duration > engine->philosophers[id].max_wait_time_ms) {
            engine->philosophers[id].max_wait_time_ms = wait_duration;
        }
        events_emit_philosopher_state(id, STATE_EATING, engine->philosophers[id].meals_completed, wait_duration);
        pthread_mutex_unlock(&engine->state_mutex);
        
        events_emit_log("info", "Philosopher %d started EATING (Meal #%d, waited %llu ms)",
                        id, engine->philosophers[id].meals_completed, (unsigned long long)wait_duration);
        
        int eat_duration = get_random_range(engine->config.eat_time_min_ms, engine->config.eat_time_max_ms);
        interruptible_sleep_ms(engine, eat_duration);
        
        /* ------------------------------------------------------------- */
        /* 5. RELEASE FORKS                                              */
        /* ------------------------------------------------------------- */
        sync_release_forks(engine, id);
        
        /* If deadlock demo mode ran, we only needed 1 pass of circular wait */
        if (engine->config.deadlock_demo_mode) {
            break;
        }
    }
    
    events_emit_log("info", "Philosopher thread %d terminating gracefully", id);
    return NULL;
}
