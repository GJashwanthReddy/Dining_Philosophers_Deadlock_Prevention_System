# System Architecture Specification
## Dining Philosophers Deadlock Prevention System
**Team Name:** OCTO_OSSP  
**Team Members:** G Jashwanth Reddy, Mohammad Zaid Amaan, M Pramod Krishna  
**Target Platform:** Ubuntu Linux / WSL on Windows  

---

## 1. High-Level Architectural Overview

The **Dining Philosophers Deadlock Prevention System** is engineered as a three-tier decoupled architecture designed for high-concurrency operating system simulation and real-time visualization:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      COMPONENT C: WEB DASHBOARD                        │
│   (HTML5, CSS3, Vanilla JS, SVG Rendering, WebSocket Client)           │
└────────────────────────────────────▲───────────────────────────────────┘
                                     │  WebSocket (Full-Duplex JSON)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 COMPONENT B: NODE.JS COMMUNICATION SERVER              │
│   (Express HTTP Server, ws WebSocket Server, Engine Process Manager)   │
└────────────────────────────────────▲───────────────────────────────────┘
                                     │  Standard I/O Streams (JSON Lines)
                                     │  stdin: Commands | stdout: Events
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     COMPONENT A: C SIMULATION ENGINE                   │
│   (POSIX pthreads, pthread_mutex_t, pthread_cond_t, FIFO Monitor)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component A: C Simulation Engine

The C engine (`c-engine/`) is the core computational module implementing the actual concurrent threads and operating system synchronization primitives.

### 2.1 Thread Concurrency Model
* **Philosopher Threads ($N=5$):** Each philosopher is spawned as an independent POSIX thread using `pthread_create()`. Each thread executes an infinite state loop (`THINKING` $\to$ `HUNGRY` $\to$ `WAITING` $\to$ `EATING` $\to$ `THINKING`) until a stop condition is signaled.
* **Watcher Thread:** A background thread running every 100ms to detect circular wait patterns across the shared resource table and periodically stream aggregated metrics to `stdout`.
* **Shared Resources (Forks $N=5$):** Each fork $F_i$ is protected by a dedicated `pthread_mutex_t`. Fork ownership and availability are guarded against race conditions.

### 2.2 Philosopher State Machine
```
   ┌─────────────┐        Timeout / Hunger
   │  THINKING   │ ──────────────────────────────► ┌─────────────┐
   │             │                                 │   HUNGRY    │
   └─────────────┘                                 └──────┬──────┘
          ▲                                               │ Request Forks
          │                                               ▼
   ┌──────┴──────┐        Both Forks Acquired      ┌─────────────┐
   │   EATING    │ ◄────────────────────────────── │   WAITING   │
   │             │                                 │ (Blocked)   │
   └─────────────┘                                 └─────────────┘
```

* **THINKING:** The thread sleeps for a randomized period (`think_time_min_ms` to `think_time_max_ms`) using sliced non-blocking sleeps that check for pause/stop signals.
* **HUNGRY:** The thread registers its intention to acquire resources and enters the active synchronization algorithm.
* **WAITING:** The thread holds zero or one fork and is actively blocked on synchronization primitives waiting for the remaining fork.
* **EATING:** The thread has acquired mutual exclusion on both required forks, increments meal counters, calculates waiting time, and eats for a randomized duration.

---

## 3. Component B: Node.js Communication Server

The communication server (`server/`) bridges the low-level POSIX C engine and the browser dashboard.

### 3.1 Responsibilities
1. **Engine Process Lifecycle:** Spawns and supervises `simulation_engine`. On Windows hosts, it launches through WSL with direct `exec` pipes. On native Linux hosts, it spawns the compiled binary directly.
2. **Stream Demultiplexing:** Reads `stdout` line-by-line using chunked string buffering, parses newline-delimited JSON events, and emits them to the WebSocket bus.
3. **State Caching & Snapshots:** Maintains an in-memory cache of the complete system state (philosophers, forks, metrics, active algorithm). When a browser connects or reconnects, it immediately dispatches a `{ type: "snapshot" }` event.
4. **Command Routing:** Accepts client commands via WebSocket or REST (`POST /api/command`) and serializes them onto the C process's `stdin`.
5. **Clean Shutdown:** Intercepts `SIGINT` and `SIGTERM` to send `QUIT` to the C engine, ensuring no orphaned processes or hung threads remain.

---

## 4. Component C: Web Dashboard

The frontend (`frontend/`) is a client running vanilla JavaScript with zero external CDN dependencies.

### 4.1 Key Visual Subsystems
1. **Circular Dining Table:**
   * Dynamically renders 5 philosophers at coordinates $x_i = R_{phil} \cos\theta_i + C_x$, $y_i = R_{phil} \sin\theta_i + C_y$.
   * Places 5 forks between adjacent philosophers at offset angle $\theta_{fork, i} = \theta_i + \frac{\pi}{5}$.
   * Renders real-time SVG vector links indicating fork ownership (solid emerald) and blocking requests (dashed amber).
2. **Resource Allocation Graph (RAG) & Coffman Checklist:**
   * Monitors the directed bipartite graph of resources and processes.
   * Real-time tracking of the 4 Coffman conditions: Mutual Exclusion, Hold & Wait, No Preemption, and Circular Wait.
3. **Live Metrics & Fairness Distribution:**
   * Visualizes total meals, average/max waiting times, and a per-philosopher meal distribution bar chart demonstrating starvation-freedom.
4. **Interactive Event Stream:**
   * Timestamped event viewer with filtering for state transitions, allocations, warnings, and deadlocks.

---

## 5. Inter-Process Communication Protocol

Communication between the C engine and the Node.js server uses newline-delimited JSON (`\n`) over standard streams:

### 5.1 C Engine to Server (`stdout`)
```json
{"type":"philosopher_state","timestampMs":1420,"philosopherId":2,"state":"EATING","mealsCompleted":4,"currentWaitMs":45}
{"type":"fork_state","timestampMs":1420,"forkId":2,"owner":2,"available":false}
{"type":"metrics","timestampMs":1500,"uptimeMs":5000,"totalMeals":18,"averageWaitingTimeMs":42.5,"maximumWaitingTimeMs":120,"stateCounts":{"thinking":2,"hungry":0,"waiting":1,"eating":2},"mealsPerPhilosopher":[4,3,4,3,4]}
{"type":"deadlock_detected","timestampMs":2100,"cycle":[0,1,2,3,4],"description":"Coffman conditions verified: Circular wait detected across all 5 philosophers."}
{"type":"log","timestampMs":2100,"level":"info","message":"Philosopher 0 acquired left fork 0"}
```

### 5.2 Server to C Engine (`stdin`)
```
START resource_ordering\n
START fair_fifo\n
DEMO_DEADLOCK\n
PAUSE\n
RESUME\n
STOP\n
RESET\n
CONFIG 800 1600 800 1600\n
QUIT\n
```
