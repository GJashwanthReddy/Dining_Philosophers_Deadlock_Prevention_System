#ifndef TYPES_H
#define TYPES_H

#include <pthread.h>
#include <stdbool.h>
#include <stdint.h>

#define DEFAULT_NUM_PHILOSOPHERS 5
#define MAX_PHILOSOPHERS 10
#define DEFAULT_THINK_MIN_MS 800
#define DEFAULT_THINK_MAX_MS 1600
#define DEFAULT_EAT_MIN_MS 800
#define DEFAULT_EAT_MAX_MS 1600

/* Philosopher States */
typedef enum {
    STATE_THINKING = 0,
    STATE_HUNGRY   = 1,
    STATE_WAITING  = 2,
    STATE_EATING   = 3
} philosopher_state_t;

/* Algorithm Types */
typedef enum {
    ALGO_NAIVE_LEFT_FIRST   = 0,
    ALGO_RESOURCE_ORDERING  = 1,
    ALGO_FAIR_FIFO          = 2
} algorithm_type_t;

/* Engine Status */
typedef enum {
    STATUS_STOPPED = 0,
    STATUS_RUNNING = 1,
    STATUS_PAUSED  = 2,
    STATUS_DEADLOCKED = 3
} engine_status_t;

/* Fork Acquisition Strategy / Preference */
typedef enum {
    FORK_PREF_LEFT_FIRST   = 0,
    FORK_PREF_RIGHT_FIRST  = 1,
    FORK_PREF_RANDOM       = 2,
    FORK_PREF_CUSTOM       = 3
} fork_preference_t;

/* Fork Structure representing a shared resource */
typedef struct {
    int id;
    pthread_mutex_t mutex;
    int owner_id;         /* Philosopher ID or -1 if free */
    bool is_available;
} fork_t;

/* Philosopher Structure representing a concurrent thread */
typedef struct {
    int id;
    philosopher_state_t state;
    int left_fork_id;
    int right_fork_id;
    int meals_completed;
    
    /* Fork acquisition tracking */
    int requested_first_fork;   /* Currently requested first fork (-1 if none) */
    int requested_second_fork;  /* Currently requested second fork (-1 if none) */
    int acquired_forks_count;   /* 0, 1, or 2 */
    unsigned int rand_seed;     /* Thread-safe random seed */
    
    /* Metrics and timing */
    uint64_t state_entered_time_ms;
    uint64_t hungry_start_time_ms;
    uint64_t total_wait_time_ms;
    uint64_t max_wait_time_ms;
    uint64_t wait_events_count;
    
    pthread_t thread;
    bool thread_active;
} philosopher_t;

/* Simulation Configuration */
typedef struct {
    int num_philosophers;
    algorithm_type_t algorithm;
    fork_preference_t fork_preference;
    int custom_philosopher_pref[MAX_PHILOSOPHERS]; /* 0: Left-first, 1: Right-first */
    int think_time_min_ms;
    int think_time_max_ms;
    int eat_time_min_ms;
    int eat_time_max_ms;
    bool deadlock_demo_mode;
} engine_config_t;

/* FIFO Queue Node for Fair Monitor Algorithm */
typedef struct fifo_node {
    int philosopher_id;
    uint64_t request_time_ms;
    struct fifo_node *next;
} fifo_node_t;

/* Complete Engine State */
typedef struct {
    engine_config_t config;
    engine_status_t status;
    
    philosopher_t philosophers[MAX_PHILOSOPHERS];
    fork_t forks[MAX_PHILOSOPHERS];
    
    /* Global Control */
    bool is_running;
    bool is_paused;
    bool stop_requested;
    uint64_t start_time_ms;
    uint64_t uptime_ms;
    
    /* Synchronization Primitives */
    pthread_mutex_t state_mutex;
    pthread_cond_t pause_cond;
    
    /* Fair FIFO Monitor Primitives */
    pthread_mutex_t monitor_mutex;
    pthread_cond_t can_eat_cond[MAX_PHILOSOPHERS];
    fifo_node_t *fifo_head;
    fifo_node_t *fifo_tail;
    
    /* Deadlock Demo Coordination */
    pthread_barrier_t deadlock_barrier;
    bool deadlock_barrier_active;
    bool deadlock_detected;
    int deadlock_cycle[MAX_PHILOSOPHERS];
    int deadlock_cycle_length;
    
} simulation_engine_t;

#endif /* TYPES_H */
