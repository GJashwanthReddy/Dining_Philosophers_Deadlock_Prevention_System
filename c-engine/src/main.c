#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include <pthread.h>
#include "types.h"
#include "events.h"
#include "synchronization.h"
#include "philosopher.h"

static simulation_engine_t g_engine;
static pthread_t g_watcher_thread;
static bool g_watcher_running = false;
static volatile sig_atomic_t g_quit_requested = 0;

static void handle_signal(int sig) {
    (void)sig;
    g_quit_requested = 1;
}

static void init_engine_defaults(simulation_engine_t *engine) {
    memset(engine, 0, sizeof(simulation_engine_t));
    
    engine->config.num_philosophers = DEFAULT_NUM_PHILOSOPHERS;
    engine->config.algorithm = ALGO_RESOURCE_ORDERING;
    engine->config.fork_preference = FORK_PREF_LEFT_FIRST;
    for (int i = 0; i < MAX_PHILOSOPHERS; i++) {
        engine->config.custom_philosopher_pref[i] = FORK_PREF_LEFT_FIRST;
    }
    engine->config.think_time_min_ms = DEFAULT_THINK_MIN_MS;
    engine->config.think_time_max_ms = DEFAULT_THINK_MAX_MS;
    engine->config.eat_time_min_ms = DEFAULT_EAT_MIN_MS;
    engine->config.eat_time_max_ms = DEFAULT_EAT_MAX_MS;
    engine->config.deadlock_demo_mode = false;
    
    engine->status = STATUS_STOPPED;
    engine->is_running = false;
    engine->is_paused = false;
    engine->stop_requested = false;
    engine->start_time_ms = 0;
    engine->uptime_ms = 0;
    
    int n = engine->config.num_philosophers;
    for (int i = 0; i < n; i++) {
        engine->philosophers[i].id = i;
        engine->philosophers[i].state = STATE_THINKING;
        engine->philosophers[i].left_fork_id = i;
        engine->philosophers[i].right_fork_id = (i + 1) % n;
        engine->philosophers[i].meals_completed = 0;
        engine->philosophers[i].state_entered_time_ms = 0;
        engine->philosophers[i].hungry_start_time_ms = 0;
        engine->philosophers[i].total_wait_time_ms = 0;
        engine->philosophers[i].max_wait_time_ms = 0;
        engine->philosophers[i].wait_events_count = 0;
        engine->philosophers[i].thread_active = false;
        engine->philosophers[i].requested_first_fork = -1;
        engine->philosophers[i].requested_second_fork = -1;
        engine->philosophers[i].acquired_forks_count = 0;
        
        engine->forks[i].id = i;
        engine->forks[i].owner_id = -1;
        engine->forks[i].is_available = true;
    }
}

static void engine_emit_snapshot(simulation_engine_t *engine) {
    events_emit_init(engine);
    int n = engine->config.num_philosophers;
    for (int i = 0; i < n; i++) {
        int req_fork = (engine->philosophers[i].requested_second_fork >= 0) ?
                        engine->philosophers[i].requested_second_fork :
                        engine->philosophers[i].requested_first_fork;
        events_emit_philosopher_state(i, engine->philosophers[i].state,
                                      engine->philosophers[i].meals_completed,
                                      (engine->philosophers[i].state == STATE_WAITING || engine->philosophers[i].state == STATE_HUNGRY) ?
                                      (get_current_time_ms() - engine->philosophers[i].hungry_start_time_ms) : 0,
                                      req_fork,
                                      engine->philosophers[i].acquired_forks_count);
        events_emit_fork_state(i, engine->forks[i].owner_id, engine->forks[i].is_available);
    }
    events_emit_metrics(engine);
}

static void engine_stop(simulation_engine_t *engine) {
    if (!engine->is_running) return;
    
    events_emit_log("info", "Stopping simulation engine...");
    engine->stop_requested = true;
    engine->is_paused = false;
    
    /* Unlock any blocked forks / condition variables so threads can wake and exit */
    sync_unlock_all_for_shutdown(engine);
    
    int n = engine->config.num_philosophers;
    for (int i = 0; i < n; i++) {
        if (engine->philosophers[i].thread_active) {
            pthread_join(engine->philosophers[i].thread, NULL);
            engine->philosophers[i].thread_active = false;
        }
    }
    
    /* Reset fork states */
    for (int i = 0; i < n; i++) {
        engine->forks[i].owner_id = -1;
        engine->forks[i].is_available = true;
        events_emit_fork_state(i, -1, true);
    }
    
    engine->is_running = false;
    engine->status = STATUS_STOPPED;
    engine->deadlock_detected = false;
    engine->config.deadlock_demo_mode = false;
    
    events_emit_status(STATUS_STOPPED, engine->config.algorithm, "Simulation stopped cleanly.");
    events_emit_metrics(engine);
}

static void engine_start(simulation_engine_t *engine, algorithm_type_t algo, bool demo_deadlock) {
    if (engine->is_running) {
        engine_stop(engine);
    }
    
    engine->config.algorithm = algo;
    engine->config.deadlock_demo_mode = demo_deadlock;
    engine->stop_requested = false;
    engine->is_paused = false;
    engine->deadlock_detected = false;
    engine->start_time_ms = get_current_time_ms();
    engine->status = STATUS_RUNNING;
    
    /* Re-init synchronization structures */
    sync_cleanup(engine);
    sync_init(engine);
    
    int n = engine->config.num_philosophers;
    for (int i = 0; i < n; i++) {
        engine->philosophers[i].state = STATE_THINKING;
        engine->forks[i].owner_id = -1;
        engine->forks[i].is_available = true;
    }
    
    events_emit_status(STATUS_RUNNING, algo,
                       demo_deadlock ? "Starting controlled circular wait deadlock demonstration." :
                                       "Starting continuous Dining Philosophers simulation.");
    engine_emit_snapshot(engine);
    
    /* Spawn philosopher threads */
    for (int i = 0; i < n; i++) {
        philosopher_args_t *args = (philosopher_args_t*)malloc(sizeof(philosopher_args_t));
        args->engine = engine;
        args->id = i;
        
        engine->philosophers[i].thread_active = true;
        if (pthread_create(&engine->philosophers[i].thread, NULL, philosopher_thread_func, args) != 0) {
            events_emit_log("error", "Failed to create thread for Philosopher %d", i);
            engine->philosophers[i].thread_active = false;
            free(args);
        }
    }
    
    engine->is_running = true;
}

static void engine_pause(simulation_engine_t *engine) {
    if (!engine->is_running || engine->is_paused) return;
    
    pthread_mutex_lock(&engine->state_mutex);
    engine->is_paused = true;
    engine->status = STATUS_PAUSED;
    pthread_mutex_unlock(&engine->state_mutex);
    
    events_emit_status(STATUS_PAUSED, engine->config.algorithm, "Simulation paused.");
    events_emit_log("info", "Simulation paused by operator.");
}

static void engine_resume(simulation_engine_t *engine) {
    if (!engine->is_running || !engine->is_paused) return;
    
    pthread_mutex_lock(&engine->state_mutex);
    engine->is_paused = false;
    engine->status = STATUS_RUNNING;
    pthread_cond_broadcast(&engine->pause_cond);
    pthread_mutex_unlock(&engine->state_mutex);
    
    events_emit_status(STATUS_RUNNING, engine->config.algorithm, "Simulation resumed.");
    events_emit_log("info", "Simulation resumed by operator.");
}

static void engine_reset(simulation_engine_t *engine) {
    if (engine->is_running) {
        engine_stop(engine);
    }
    
    int n = engine->config.num_philosophers;
    for (int i = 0; i < n; i++) {
        engine->philosophers[i].meals_completed = 0;
        engine->philosophers[i].total_wait_time_ms = 0;
        engine->philosophers[i].max_wait_time_ms = 0;
        engine->philosophers[i].wait_events_count = 0;
        engine->philosophers[i].state = STATE_THINKING;
    }
    engine->uptime_ms = 0;
    engine->start_time_ms = 0;
    
    events_emit_status(STATUS_STOPPED, engine->config.algorithm, "Metrics and state reset.");
    engine_emit_snapshot(engine);
    events_emit_log("info", "All metrics, wait times, and meal counters reset to 0.");
}

/* Background watcher thread for periodic metrics and deadlock verification */
static void* watcher_thread_func(void *arg) {
    simulation_engine_t *engine = (simulation_engine_t*)arg;
    uint64_t last_metrics_ms = 0;
    
    while (g_watcher_running) {
        uint64_t now = get_current_time_ms();
        
        if (engine->is_running) {
            /* Check for circular-wait deadlock */
            sync_check_deadlock(engine);
            
            /* Emit metrics every 500ms */
            if (now - last_metrics_ms >= 500) {
                events_emit_metrics(engine);
                last_metrics_ms = now;
            }
        }
        
        usleep(100000); /* 100ms interval */
    }
    return NULL;
}

/* Command parsing from stdin */
static void process_command_line(char *line, simulation_engine_t *engine) {
    /* Strip newline */
    char *nl = strchr(line, '\n');
    if (nl) *nl = '\0';
    nl = strchr(line, '\r');
    if (nl) *nl = '\0';
    
    if (strlen(line) == 0) return;
    
    /* Handle JSON command format e.g. {"cmd":"start", "algorithm":"resource_ordering"} */
    if (strstr(line, "\"cmd\":\"start\"") || strstr(line, "\"cmd\": \"start\"")) {
        algorithm_type_t algo = engine->config.algorithm;
        bool demo = false;
        if (strstr(line, "naive_left_first") || strstr(line, "naive")) algo = ALGO_NAIVE_LEFT_FIRST;
        else if (strstr(line, "resource_ordering")) algo = ALGO_RESOURCE_ORDERING;
        else if (strstr(line, "fair_fifo")) algo = ALGO_FAIR_FIFO;
        
        if (strstr(line, "\"demo\":true") || strstr(line, "\"demo\": true")) demo = true;
        engine_start(engine, algo, demo);
        return;
    }
    if (strstr(line, "\"cmd\":\"pause\"") || strstr(line, "\"cmd\": \"pause\"")) {
        engine_pause(engine);
        return;
    }
    if (strstr(line, "\"cmd\":\"resume\"") || strstr(line, "\"cmd\": \"resume\"")) {
        engine_resume(engine);
        return;
    }
    if (strstr(line, "\"cmd\":\"stop\"") || strstr(line, "\"cmd\": \"stop\"")) {
        engine_stop(engine);
        return;
    }
    if (strstr(line, "\"cmd\":\"reset\"") || strstr(line, "\"cmd\": \"reset\"")) {
        engine_reset(engine);
        return;
    }
    if (strstr(line, "\"cmd\":\"snapshot\"") || strstr(line, "\"cmd\": \"snapshot\"")) {
        engine_emit_snapshot(engine);
        return;
    }
    if (strstr(line, "\"cmd\":\"demo_deadlock\"") || strstr(line, "\"cmd\": \"demo_deadlock\"")) {
        engine_start(engine, ALGO_NAIVE_LEFT_FIRST, true);
        return;
    }
    if (strstr(line, "\"cmd\":\"fork_pref\"") || strstr(line, "\"cmd\": \"fork_pref\"")) {
        fork_preference_t pref = FORK_PREF_LEFT_FIRST;
        if (strstr(line, "right_first")) pref = FORK_PREF_RIGHT_FIRST;
        else if (strstr(line, "random")) pref = FORK_PREF_RANDOM;
        else if (strstr(line, "custom")) pref = FORK_PREF_CUSTOM;
        else if (strstr(line, "left_first")) pref = FORK_PREF_LEFT_FIRST;
        
        engine->config.fork_preference = pref;
        
        char *custom_ptr = strstr(line, "\"custom\"");
        if (custom_ptr) {
            char *arr_start = strchr(custom_ptr, '[');
            if (arr_start) {
                int p_idx = 0;
                char *curr = arr_start + 1;
                while (*curr && *curr != ']' && p_idx < MAX_PHILOSOPHERS) {
                    if (*curr == '0' || *curr == '1' || *curr == '2') {
                        engine->config.custom_philosopher_pref[p_idx++] = (*curr == '1') ? FORK_PREF_RIGHT_FIRST :
                                                                          (*curr == '2') ? FORK_PREF_RANDOM : FORK_PREF_LEFT_FIRST;
                    }
                    curr++;
                }
            }
        }
        events_emit_log("info", "Fork acquisition strategy set to: %s", fork_preference_to_string(engine->config.fork_preference));
        events_emit_init(engine);
        return;
    }
    
    /* Handle plain text command format */
    char cmd[64] = {0};
    char arg1[64] = {0};
    char arg2[64] = {0};
    int matched = sscanf(line, "%63s %63s %63s", cmd, arg1, arg2);
    
    if (strcasecmp(cmd, "START") == 0) {
        algorithm_type_t algo = engine->config.algorithm;
        bool demo = false;
        if (matched >= 2) {
            if (strcasecmp(arg1, "naive") == 0 || strcasecmp(arg1, "naive_left_first") == 0) {
                algo = ALGO_NAIVE_LEFT_FIRST;
            } else if (strcasecmp(arg1, "resource") == 0 || strcasecmp(arg1, "resource_ordering") == 0) {
                algo = ALGO_RESOURCE_ORDERING;
            } else if (strcasecmp(arg1, "fifo") == 0 || strcasecmp(arg1, "fair_fifo") == 0) {
                algo = ALGO_FAIR_FIFO;
            }
        }
        if (matched >= 3 && strcasecmp(arg2, "demo") == 0) {
            demo = true;
        }
        engine_start(engine, algo, demo);
    } else if (strcasecmp(cmd, "PAUSE") == 0) {
        engine_pause(engine);
    } else if (strcasecmp(cmd, "RESUME") == 0) {
        engine_resume(engine);
    } else if (strcasecmp(cmd, "STOP") == 0) {
        engine_stop(engine);
    } else if (strcasecmp(cmd, "RESET") == 0) {
        engine_reset(engine);
    } else if (strcasecmp(cmd, "DEMO_DEADLOCK") == 0) {
        engine_start(engine, ALGO_NAIVE_LEFT_FIRST, true);
    } else if (strcasecmp(cmd, "FORK_PREF") == 0) {
        if (matched >= 2) {
            if (strcasecmp(arg1, "right_first") == 0 || strcasecmp(arg1, "right") == 0) {
                engine->config.fork_preference = FORK_PREF_RIGHT_FIRST;
            } else if (strcasecmp(arg1, "random") == 0) {
                engine->config.fork_preference = FORK_PREF_RANDOM;
            } else if (strcasecmp(arg1, "custom") == 0) {
                engine->config.fork_preference = FORK_PREF_CUSTOM;
                int c0 = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0;
                if (sscanf(line, "%*s %*s %d %d %d %d %d", &c0, &c1, &c2, &c3, &c4) >= 1) {
                    engine->config.custom_philosopher_pref[0] = (c0 == 1) ? FORK_PREF_RIGHT_FIRST : FORK_PREF_LEFT_FIRST;
                    engine->config.custom_philosopher_pref[1] = (c1 == 1) ? FORK_PREF_RIGHT_FIRST : FORK_PREF_LEFT_FIRST;
                    engine->config.custom_philosopher_pref[2] = (c2 == 1) ? FORK_PREF_RIGHT_FIRST : FORK_PREF_LEFT_FIRST;
                    engine->config.custom_philosopher_pref[3] = (c3 == 1) ? FORK_PREF_RIGHT_FIRST : FORK_PREF_LEFT_FIRST;
                    engine->config.custom_philosopher_pref[4] = (c4 == 1) ? FORK_PREF_RIGHT_FIRST : FORK_PREF_LEFT_FIRST;
                }
            } else {
                engine->config.fork_preference = FORK_PREF_LEFT_FIRST;
            }
            events_emit_log("info", "Fork acquisition strategy set to: %s", fork_preference_to_string(engine->config.fork_preference));
            events_emit_init(engine);
        }
    } else if (strcasecmp(cmd, "SNAPSHOT") == 0) {
        engine_emit_snapshot(engine);
    } else if (strcasecmp(cmd, "CONFIG") == 0) {
        int tmin, tmax, emin, emax;
        if (sscanf(line, "CONFIG %d %d %d %d", &tmin, &tmax, &emin, &emax) == 4) {
            if (tmin > 50 && tmax >= tmin && emin > 50 && emax >= emin) {
                engine->config.think_time_min_ms = tmin;
                engine->config.think_time_max_ms = tmax;
                engine->config.eat_time_min_ms = emin;
                engine->config.eat_time_max_ms = emax;
                events_emit_log("info", "Configuration updated: Think [%d-%d ms], Eat [%d-%d ms]",
                                tmin, tmax, emin, emax);
                events_emit_init(engine);
            } else {
                events_emit_log("warn", "Invalid CONFIG parameters ignored.");
            }
        }
    } else if (strcasecmp(cmd, "QUIT") == 0 || strcasecmp(cmd, "EXIT") == 0) {
        g_quit_requested = 1;
    } else {
        events_emit_log("warn", "Unrecognized command: %s", line);
    }
}

int main(int argc, char *argv[]) {
    (void)argc;
    (void)argv;
    
    /* Disable stdio buffering for clean real-time streaming */
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
    
    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);
    
    events_init();
    init_engine_defaults(&g_engine);
    sync_init(&g_engine);
    
    /* Start background watcher */
    g_watcher_running = true;
    pthread_create(&g_watcher_thread, NULL, watcher_thread_func, &g_engine);
    
    /* Send initial snapshot on boot */
    engine_emit_snapshot(&g_engine);
    events_emit_log("info", "OCTO_OSSP Dining Philosophers C Simulation Engine initialized.");
    
    /* If run with --autostart flag or args, start immediately */
    if (argc > 1 && strcmp(argv[1], "--autostart") == 0) {
        engine_start(&g_engine, ALGO_RESOURCE_ORDERING, false);
    }
    
    char line_buffer[512];
    while (!g_quit_requested) {
        if (fgets(line_buffer, sizeof(line_buffer), stdin) == NULL) {
            /* EOF on stdin: stop and break */
            break;
        }
        process_command_line(line_buffer, &g_engine);
    }
    
    /* Graceful teardown */
    events_emit_log("info", "Shutting down simulation engine...");
    engine_stop(&g_engine);
    
    g_watcher_running = false;
    pthread_join(g_watcher_thread, NULL);
    
    sync_cleanup(&g_engine);
    events_destroy();
    
    return 0;
}
