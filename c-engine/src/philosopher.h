#ifndef PHILOSOPHER_H
#define PHILOSOPHER_H

#include "types.h"

typedef struct {
    simulation_engine_t *engine;
    int id;
} philosopher_args_t;

/* Philosopher thread routine */
void* philosopher_thread_func(void *arg);

/* Helper to generate random duration between min and max ms */
int get_random_range(int min_val, int max_val);

/* Responsive interruptible sleep */
void interruptible_sleep_ms(simulation_engine_t *engine, int duration_ms);

#endif /* PHILOSOPHER_H */
