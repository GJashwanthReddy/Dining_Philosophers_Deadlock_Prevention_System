#ifndef EVENTS_H
#define EVENTS_H

#include "types.h"

/* High-resolution monotonic timestamp in milliseconds */
uint64_t get_current_time_ms(void);

/* Initialize/cleanup event emitter */
void events_init(void);
void events_destroy(void);

/* Helper to convert state/algorithm to string */
const char* state_to_string(philosopher_state_t state);
const char* algorithm_to_string(algorithm_type_t algo);
const char* status_to_string(engine_status_t status);

/* JSON Lines event emitters to stdout */
void events_emit_init(const simulation_engine_t *engine);
void events_emit_status(engine_status_t status, algorithm_type_t algo, const char *msg);
void events_emit_philosopher_state(int id, philosopher_state_t state, int meals, uint64_t current_wait_ms);
void events_emit_fork_state(int fork_id, int owner_id, bool available);
void events_emit_metrics(const simulation_engine_t *engine);
void events_emit_deadlock(const int *cycle, int length, const char *description);
void events_emit_log(const char *level, const char *format, ...);

#endif /* EVENTS_H */
