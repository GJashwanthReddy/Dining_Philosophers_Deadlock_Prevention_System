#ifndef SYNCHRONIZATION_H
#define SYNCHRONIZATION_H

#include "types.h"

/* Initialize all synchronization primitives (mutexes, condition variables, barriers) */
void sync_init(simulation_engine_t *engine);

/* Destroy and clean up all synchronization primitives */
void sync_cleanup(simulation_engine_t *engine);

/* Algorithm 1: Naive Left-First fork acquisition and release */
bool sync_naive_acquire_forks(simulation_engine_t *engine, int philosopher_id);
void sync_naive_release_forks(simulation_engine_t *engine, int philosopher_id);

/* Algorithm 2: Resource Ordering (Global hierarchy: lower index fork first) */
bool sync_resource_ordering_acquire_forks(simulation_engine_t *engine, int philosopher_id);
void sync_resource_ordering_release_forks(simulation_engine_t *engine, int philosopher_id);

/* Algorithm 3: Fair FIFO Monitor admission control */
bool sync_fair_fifo_acquire_forks(simulation_engine_t *engine, int philosopher_id);
void sync_fair_fifo_release_forks(simulation_engine_t *engine, int philosopher_id);

/* General dispatcher based on selected algorithm */
bool sync_acquire_forks(simulation_engine_t *engine, int philosopher_id);
void sync_release_forks(simulation_engine_t *engine, int philosopher_id);

/* Deadlock detection watcher for educational demonstration */
bool sync_check_deadlock(simulation_engine_t *engine);
void sync_unlock_all_for_shutdown(simulation_engine_t *engine);

#endif /* SYNCHRONIZATION_H */
