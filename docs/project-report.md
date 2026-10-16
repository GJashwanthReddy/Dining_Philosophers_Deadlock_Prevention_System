# ACADEMIC PROJECT REPORT
## Dining Philosophers Deadlock Prevention System
### Concurrency, Synchronization, Deadlock Elimination, and Starvation Prevention

---

### 1. Title Page
* **Project Title:** Dining Philosophers Deadlock Prevention System
* **Course:** Operating Systems & Systems Programming (OSSP)
* **Team Name:** OCTO_OSSP
* **Institutional Context:** Undergraduate Computer Science & Engineering Hackathon
* **Submission Date:** October 2026

---

### 2. Team Details
1. **G Jashwanth Reddy** — System Architect & C Engine Concurrency Engineer
2. **Mohammad Zaid Amaan** — Communication Server & IPC Protocol Developer
3. **M Pramod Krishna** — Frontend Dashboard & Systems Visualization Designer

---

### 3. Abstract
Concurrent process synchronization is a foundational challenge in modern Operating Systems. When concurrent threads compete for bounded shared resources, uncoordinated acquisition frequently culminates in race conditions, deadlock, and thread starvation. This project implements a full-stack, real-time Operating Systems simulation suite based on Dijkstra's classic Dining Philosophers problem. Built using native POSIX threads (`pthreads`) and synchronization primitives in C, the system demonstrates three distinct strategies: (1) a naive deadlock-prone baseline with deterministic circular wait demonstration, (2) Dijkstra's resource ordering hierarchy that mathematically proves and enforces deadlock freedom by breaking Coffman's fourth condition, and (3) a condition-variable monitor with a FIFO arrival admission controller that guarantees starvation freedom. A Node.js intermediary multiplexes C standard I/O events across full-duplex WebSockets to a web dashboard visualizing circular dining dynamics, the Resource Allocation Graph (RAG), and fairness distributions. Rigorous verification across 27 C unit assertions and 7 integration test suites confirms 100% correctness and safe, deterministic resource lifecycle management.

---

### 4. Introduction
In multi-programmed and multi-core operating systems, processes execute concurrently and must synchronize when requesting non-preemptible resources. The Dining Philosophers problem, originally formulated by Edsger W. Dijkstra in 1965, models synchronization challenges where processes (philosophers) share mutual exclusion resources (forks). Without synchronization, simultaneous resource requests generate circular waiting, causing all processes to halt indefinitely in a deadlock. This project provides an educational and technical platform that executes real POSIX threads and renders their synchronization dynamics in real time.

---

### 5. Problem Statement
*"Implement and visualize different synchronization strategies to prevent deadlock and starvation among competing processes/threads."*

---

### 6. Objectives
1. Implement a genuine multi-threaded POSIX C simulation engine using `pthread`, `pthread_mutex_t`, and `pthread_cond_t`.
2. Model the five philosophers and shared forks with strict mutual exclusion invariants.
3. Build a reproducible, controlled deadlock demonstration illustrating circular wait without permanently freezing the host OS.
4. Implement and formally verify Dijkstra's Resource Ordering technique to guarantee deadlock prevention.
5. Engineer a fair monitor-based FIFO admission policy to eliminate thread starvation.
6. Build a low-latency communication pipeline using newline-delimited JSON streams over IPC and WebSockets.
7. Construct an interactive, responsive dark-themed dashboard displaying table dynamics, live metrics, and Coffman condition states.
8. Deliver an automated test harness validating invariants, fairness, and graceful shutdown.

---

### 7. Operating Systems Concepts Involved
* **Threads & Concurrency:** Independent execution contexts sharing memory within a single process address space (`pthread_create`, `pthread_join`).
* **Critical Sections & Mutual Exclusion:** Protecting shared data structures and fork ownership against concurrent modification using mutex locks (`pthread_mutex_lock`, `pthread_mutex_unlock`).
* **Condition Variables & Monitors:** Synchronizing threads based on boolean state conditions without busy-waiting (`pthread_cond_wait`, `pthread_cond_signal`).
* **The Four Coffman Conditions:** Mutual Exclusion, Hold & Wait, No Preemption, and Circular Wait.
* **Resource Allocation Graph (RAG):** Directed bipartite graph tracking resource assignment and process request edges.
* **Starvation vs Deadlock vs Livelock:** Distinguishing permanent system halt (deadlock), indefinite postponement of an individual process (starvation), and continuous state change without forward progress (livelock).

---

### 8. Existing Approach and Its Limitations
Conventional academic demonstrations of the Dining Philosophers problem exhibit significant shortcomings:
1. **Frontend-Only Simulators:** Many demonstrations simulate state transitions using browser `setTimeout()` calls without actual underlying OS threads, falsifying concurrency dynamics.
2. **Crash-Prone Deadlocks:** Naive C implementations often call unconditional blocking mutex locks that permanently freeze the terminal process, requiring manual SIGKILL.
3. **Absence of Starvation Controls:** Standard solutions that prevent deadlock (such as resource ordering) often neglect starvation, allowing asymmetric thread scheduling where certain philosophers receive zero meals over extended runs.

---

### 9. Proposed Solution
Our system solves these limitations by implementing:
1. **Real POSIX Threads:** Five native C threads competing for five POSIX mutex forks.
2. **Safe Coordinated Deadlock Demo:** An educational sync barrier that deterministically aligns thread acquisitions to create circular wait, paired with a non-blocking cancel/timeout mechanism that allows clean user termination.
3. **Resource Ordering (Dijkstra):** Global partial order assigning lower-numbered forks first, mathematically eliminating cycles.
4. **Fair FIFO Monitor:** An admission controller tracking arrival timestamps and condition variables, guaranteeing fair dining opportunities.
5. **Real-Time Web Dashboard:** A live SVG-driven circular visualization connected to the C engine via WebSockets.

---

### 10. System Architecture
The system consists of three decoupled layers:
* **Component A (C Simulation Engine):** Handles POSIX threads, synchronization algorithms, and telemetry generation.
* **Component B (Node.js Server):** Manages process execution, stream buffering, JSON parsing, and WebSocket broadcasting.
* **Component C (Web Dashboard):** Renders the dining table, Resource Allocation Graph, live metrics, and event log.

---

### 11. Hardware and Software Requirements
* **Hardware:** Any x86_64 or ARM64 computer with at least 2 CPU cores and 2 GB RAM.
* **Operating System:** Ubuntu Linux 20.04+ or Windows 10/11 with WSL2 (Ubuntu).
* **Compiler & Build Tools:** GCC 9.0+ with `-pthread` support, GNU Make 4.0+.
* **Runtime Environment:** Node.js v18.0+ and npm.
* **Browser:** Any modern standards-compliant browser (Chrome, Firefox, Edge, Safari).

---

### 12. Design of Philosopher and Fork Data Structures

```c
typedef struct {
    int id;
    pthread_mutex_t mutex;
    int owner_id;         /* Philosopher ID or -1 if unowned */
    bool is_available;    /* Mutual exclusion status */
} fork_t;

typedef struct {
    int id;
    philosopher_state_t state;
    int left_fork_id;
    int right_fork_id;
    int meals_completed;
    uint64_t state_entered_time_ms;
    uint64_t hungry_start_time_ms;
    uint64_t total_wait_time_ms;
    uint64_t max_wait_time_ms;
    uint64_t wait_events_count;
    pthread_t thread;
    bool thread_active;
} philosopher_t;
```

---

### 13. Synchronization Strategy
* Fork mutexes enforce strict mutual exclusion ($M=1$).
* State updates and metrics aggregation are protected by `state_mutex`.
* Simulation pauses are implemented via `pause_cond` broadcast.
* Threads sleep in 20ms slices during thinking and eating to ensure rapid responsiveness to stop and pause commands.

---

### 14. Deadlock Demonstration and Prevention

#### 14.1 Deadlock Demonstration
In Algorithm 1 (Naive Left-First), philosophers lock left fork $i$, synchronize at a POSIX barrier, and then request right fork $(i+1)\%5$. This creates a cycle:
$$P_0 \to F_1 \to P_1 \to F_2 \to P_2 \to F_3 \to P_3 \to F_4 \to P_4 \to F_0 \to P_0$$
The background watcher detects this condition and emits a `deadlock_detected` alert.

#### 14.2 Deadlock Prevention (Resource Ordering)
By enforcing:
$$\text{first\_fork} = \min(L, R), \quad \text{second\_fork} = \max(L, R)$$
Philosopher 4 requests Fork 0 before Fork 4. If Philosopher 0 holds Fork 0, Philosopher 4 is blocked before touching Fork 4, keeping Fork 4 available for Philosopher 3. The Resource Allocation Graph is an acyclic directed graph (DAG), making circular wait mathematically impossible.

---

### 15. Starvation Prevention and Fairness
In Algorithm 3 (Fair FIFO Monitor), hungry philosophers are enqueued in arrival order. A hungry philosopher can only be admitted if both forks are free and no earlier queued philosopher requires either fork. Under the finite eating assumption ($t_{eat} \le T_{max}$), maximum wait time is bounded by $K \cdot T_{max}$ for queue position $K$, guaranteeing starvation freedom.

---

### 16. Communication Protocol
The C process emits JSON Lines events over `stdout`:
* `init`: Configuration parameters.
* `philosopher_state`: ID, state, meals, waiting duration.
* `fork_state`: ID, owner, availability.
* `metrics`: Aggregate throughput, wait times, state counts.
* `deadlock_detected`: Cycle nodes and diagnostic description.
* `log`: System event diagnostics.

Commands are transmitted over `stdin` (`START`, `PAUSE`, `RESUME`, `STOP`, `RESET`, `CONFIG`, `DEMO_DEADLOCK`, `QUIT`).

---

### 17. Dashboard Implementation
The frontend dashboard features:
* Interactive circular table with CSS glowing state animations.
* SVG vector connection lines indicating real-time fork assignments.
* Live Resource Allocation Graph with Coffman condition indicators.
* Per-philosopher meal distribution bar chart demonstrating fairness.
* Filterable, timestamped event log.

---

### 18. Testing Methodology
Testing was conducted in two automated tiers:
1. **C Unit Test Suite (`test_synchronization.c`):** Tests fork mutual exclusion, resource ordering throughput, deadlock detection barrier, and fair FIFO starvation bounds.
2. **System Integration Test Suite (`integration_test.js`):** Tests process supervision, IPC line parsing, pause/resume state preservation, deadlock recovery, and WebSocket snapshot delivery.

---

### 19. Actual Test Results
* **C Unit Tests:** 27 assertions executed, 27 passed (100%).
* **Integration Tests:** 7 scenarios executed, 7 passed (100%).
* **Observed Meal Spread:** Under Fair FIFO synchronization, meal distribution across all five philosophers was $[10, 10, 10, 10, 10]$ (spread = 0), proving complete fairness.

---

### 20. Limitations
1. The simulation defaults to 5 philosophers to match standard Operating Systems curricula.
2. Thread scheduling fairness in Resource Ordering mode depends partially on the host kernel's CFS scheduler.
3. Network latency between browser and server is negligible locally but could affect high-frequency visualization over wide-area networks.

---

### 21. Conclusion
The Dining Philosophers Deadlock Prevention System successfully demonstrates how foundational concurrency and synchronization concepts operate in practice. By pairing real POSIX threads with Dijkstra's resource ordering and fair monitor admission, the project provides a comprehensive, verifiable demonstration of how deadlocks and starvation are eliminated in modern operating systems.

---

### 22. Future Enhancements
1. Dynamic addition and removal of philosophers at runtime.
2. Integration of Chandy-Misra dining algorithm using drinking philosophers extension.
3. Kernel-level eBPF tracing to visualize thread context switches directly from the Linux kernel.

---

### 23. References
1. Dijkstra, E. W. (1965). *Cooperating Sequential Processes*. Technological University Eindhoven.
2. Coffman, E. G., Elphick, M., & Shoshani, A. (1971). *System Deadlocks*. ACM Computing Surveys, 3(2), 67–78.
3. Silberschatz, A., Galvin, P. B., & Gagne, G. (2018). *Operating System Concepts* (10th ed.). John Wiley & Sons.
4. IEEE & The Open Group. (2018). *POSIX.1-2017 Standard: Threads and Synchronization Primitives*.
