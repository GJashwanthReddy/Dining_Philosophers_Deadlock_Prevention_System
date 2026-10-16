#include "events.h"
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <time.h>
#include <string.h>

static pthread_mutex_t s_event_mutex = PTHREAD_MUTEX_INITIALIZER;
static uint64_t s_base_time_ms = 0;

uint64_t get_current_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    uint64_t ms = (uint64_t)ts.tv_sec * 1000ULL + (uint64_t)(ts.tv_nsec / 1000000ULL);
    if (s_base_time_ms == 0) {
        s_base_time_ms = ms;
    }
    return ms - s_base_time_ms;
}

void events_init(void) {
    pthread_mutex_init(&s_event_mutex, NULL);
    s_base_time_ms = 0;
    (void)get_current_time_ms();
}

void events_destroy(void) {
    pthread_mutex_destroy(&s_event_mutex);
}

const char* state_to_string(philosopher_state_t state) {
    switch (state) {
        case STATE_THINKING: return "THINKING";
        case STATE_HUNGRY:   return "HUNGRY";
        case STATE_WAITING:  return "WAITING";
        case STATE_EATING:   return "EATING";
        default:             return "UNKNOWN";
    }
}

const char* algorithm_to_string(algorithm_type_t algo) {
    switch (algo) {
        case ALGO_NAIVE_LEFT_FIRST:  return "naive_left_first";
        case ALGO_RESOURCE_ORDERING: return "resource_ordering";
        case ALGO_FAIR_FIFO:         return "fair_fifo";
        default:                     return "unknown";
    }
}

const char* fork_preference_to_string(fork_preference_t pref) {
    switch (pref) {
        case FORK_PREF_LEFT_FIRST:  return "left_first";
        case FORK_PREF_RIGHT_FIRST: return "right_first";
        case FORK_PREF_RANDOM:      return "random";
        case FORK_PREF_CUSTOM:      return "custom";
        default:                    return "left_first";
    }
}

const char* status_to_string(engine_status_t status) {
    switch (status) {
        case STATUS_RUNNING:    return "RUNNING";
        case STATUS_PAUSED:     return "PAUSED";
        case STATUS_DEADLOCKED: return "DEADLOCKED";
        case STATUS_STOPPED:
        default:                return "STOPPED";
    }
}

void events_emit_init(const simulation_engine_t *engine) {
    pthread_mutex_lock(&s_event_mutex);
    uint64_t now = get_current_time_ms();
    
    printf("{\"type\":\"init\",\"timestampMs\":%llu,\"numPhilosophers\":%d,\"algorithm\":\"%s\",\"status\":\"%s\",\"forkPreference\":\"%s\",\"customPrefs\":[%d,%d,%d,%d,%d],\"thinkMinMs\":%d,\"thinkMaxMs\":%d,\"eatMinMs\":%d,\"eatMaxMs\":%d}\n",
           (unsigned long long)now,
           engine->config.num_philosophers,
           algorithm_to_string(engine->config.algorithm),
           status_to_string(engine->status),
           fork_preference_to_string(engine->config.fork_preference),
           engine->config.custom_philosopher_pref[0],
           engine->config.custom_philosopher_pref[1],
           engine->config.custom_philosopher_pref[2],
           engine->config.custom_philosopher_pref[3],
           engine->config.custom_philosopher_pref[4],
           engine->config.think_time_min_ms,
           engine->config.think_time_max_ms,
           engine->config.eat_time_min_ms,
           engine->config.eat_time_max_ms);
    fflush(stdout);
    pthread_mutex_unlock(&s_event_mutex);
}

void events_emit_status(engine_status_t status, algorithm_type_t algo, const char *msg) {
    pthread_mutex_lock(&s_event_mutex);
    uint64_t now = get_current_time_ms();
    printf("{\"type\":\"status\",\"timestampMs\":%llu,\"status\":\"%s\",\"algorithm\":\"%s\",\"message\":\"%s\"}\n",
           (unsigned long long)now,
           status_to_string(status),
           algorithm_to_string(algo),
           msg ? msg : "");
    fflush(stdout);
    pthread_mutex_unlock(&s_event_mutex);
}

void events_emit_philosopher_state(int id, philosopher_state_t state, int meals, uint64_t current_wait_ms, int requested_fork, int held_forks) {
    pthread_mutex_lock(&s_event_mutex);
    uint64_t now = get_current_time_ms();
    printf("{\"type\":\"philosopher_state\",\"timestampMs\":%llu,\"philosopherId\":%d,\"state\":\"%s\",\"mealsCompleted\":%d,\"currentWaitMs\":%llu,\"requestedFork\":%d,\"heldForks\":%d}\n",
           (unsigned long long)now,
           id,
           state_to_string(state),
           meals,
           (unsigned long long)current_wait_ms,
           requested_fork,
           held_forks);
    fflush(stdout);
    pthread_mutex_unlock(&s_event_mutex);
}

void events_emit_fork_state(int fork_id, int owner_id, bool available) {
    pthread_mutex_lock(&s_event_mutex);
    uint64_t now = get_current_time_ms();
    printf("{\"type\":\"fork_state\",\"timestampMs\":%llu,\"forkId\":%d,\"owner\":%d,\"available\":%s}\n",
           (unsigned long long)now,
           fork_id,
           owner_id,
           available ? "true" : "false");
    fflush(stdout);
    pthread_mutex_unlock(&s_event_mutex);
}

void events_emit_metrics(const simulation_engine_t *engine) {
    pthread_mutex_lock(&s_event_mutex);
    uint64_t now = get_current_time_ms();
    
    int total_meals = 0;
    uint64_t total_wait_time = 0;
    uint64_t total_wait_events = 0;
    uint64_t max_wait_time = 0;
    int state_counts[4] = {0, 0, 0, 0};
    
    for (int i = 0; i < engine->config.num_philosophers; i++) {
        total_meals += engine->philosophers[i].meals_completed;
        total_wait_time += engine->philosophers[i].total_wait_time_ms;
        total_wait_events += engine->philosophers[i].wait_events_count;
        if (engine->philosophers[i].max_wait_time_ms > max_wait_time) {
            max_wait_time = engine->philosophers[i].max_wait_time_ms;
        }
        if (engine->philosophers[i].state >= 0 && engine->philosophers[i].state <= 3) {
            state_counts[engine->philosophers[i].state]++;
        }
    }
    
    double avg_wait_time = 0.0;
    if (total_wait_events > 0) {
        avg_wait_time = (double)total_wait_time / (double)total_wait_events;
    }
    
    uint64_t uptime = engine->is_running ? (now - engine->start_time_ms) : engine->uptime_ms;
    
    printf("{\"type\":\"metrics\",\"timestampMs\":%llu,\"uptimeMs\":%llu,\"totalMeals\":%d,\"averageWaitingTimeMs\":%.1f,\"maximumWaitingTimeMs\":%llu,\"stateCounts\":{\"thinking\":%d,\"hungry\":%d,\"waiting\":%d,\"eating\":%d},\"mealsPerPhilosopher\":[",
           (unsigned long long)now,
           (unsigned long long)uptime,
           total_meals,
           avg_wait_time,
           (unsigned long long)max_wait_time,
           state_counts[STATE_THINKING],
           state_counts[STATE_HUNGRY],
           state_counts[STATE_WAITING],
           state_counts[STATE_EATING]);
           
    for (int i = 0; i < engine->config.num_philosophers; i++) {
        printf("%d%s", engine->philosophers[i].meals_completed, (i < engine->config.num_philosophers - 1) ? "," : "");
    }
    printf("]}\n");
    fflush(stdout);
    pthread_mutex_unlock(&s_event_mutex);
}

void events_emit_deadlock(const int *cycle, int length, const char *description) {
    pthread_mutex_lock(&s_event_mutex);
    uint64_t now = get_current_time_ms();
    printf("{\"type\":\"deadlock_detected\",\"timestampMs\":%llu,\"cycle\":[", (unsigned long long)now);
    for (int i = 0; i < length; i++) {
        printf("%d%s", cycle[i], (i < length - 1) ? "," : "");
    }
    printf("],\"description\":\"%s\"}\n", description ? description : "Deadlock detected (circular wait)");
    fflush(stdout);
    pthread_mutex_unlock(&s_event_mutex);
}

void events_emit_log(const char *level, const char *format, ...) {
    pthread_mutex_lock(&s_event_mutex);
    uint64_t now = get_current_time_ms();
    
    char buffer[512];
    va_list args;
    va_start(args, format);
    vsnprintf(buffer, sizeof(buffer), format, args);
    va_end(args);
    
    /* Escape quotes in JSON */
    char escaped[1024];
    int pos = 0;
    for (int i = 0; buffer[i] != '\0' && pos < 1000; i++) {
        if (buffer[i] == '"') {
            escaped[pos++] = '\\';
            escaped[pos++] = '"';
        } else if (buffer[i] == '\n' || buffer[i] == '\r') {
            escaped[pos++] = ' ';
        } else {
            escaped[pos++] = buffer[i];
        }
    }
    escaped[pos] = '\0';
    
    printf("{\"type\":\"log\",\"timestampMs\":%llu,\"level\":\"%s\",\"message\":\"%s\"}\n",
           (unsigned long long)now,
           level ? level : "info",
           escaped);
    fflush(stdout);
    pthread_mutex_unlock(&s_event_mutex);
}
