# Hackathon Presentation Slides (8–10 Slides)
## Dining Philosophers Deadlock Prevention System
**Team Name:** OCTO_OSSP  

---

### Slide 1: Title & Team Details
* **Title:** Dining Philosophers Deadlock Prevention System
* **Subtitle:** Genuine POSIX Concurrency, Deadlock Elimination, and Starvation Prevention Suite
* **Team Name:** OCTO_OSSP
* **Team Members:**
  1. G Jashwanth Reddy (System Architecture & C Concurrency)
  2. Mohammad Zaid Amaan (Communication Server & IPC Protocol)
  3. M Pramod Krishna (Systems Visualization & Analytics)
* **Target Platform:** Ubuntu Linux / WSL on Windows

---

### Slide 2: Problem Statement & Motivation
* **Problem Statement:** "Implement and visualize different synchronization strategies to prevent deadlock and starvation among competing processes/threads."
* **The Core Challenge:** Multi-threaded systems competing for limited non-preemptible resources can result in:
  * Race conditions and state corruption.
  * System-wide deadlock halts (Coffman conditions).
  * Indefinite thread starvation under naive scheduling.
* **Our Motivation:** Bridge abstract Operating Systems theory with real POSIX multi-threaded C execution and live telemetry visualization.

---

### Slide 3: The Dining Philosophers Problem
* **Classic Problem Formulation (Edsger Dijkstra, 1965):**
  * 5 Philosophers alternate between Thinking and Eating.
  * 5 Forks placed between adjacent philosophers.
  * To eat, a philosopher requires BOTH adjacent forks (left and right) simultaneously.
* **Key Invariants:**
  * Forks are mutually exclusive (`pthread_mutex_t`).
  * No two adjacent philosophers can eat at the same time.
  * At most 2 philosophers can eat concurrently ($\lfloor 5/2 \rfloor = 2$).

---

### Slide 4: System Architecture
* **Component A: C Simulation Engine**
  * POSIX threads (`pthreads`), mutexes, condition variables, and monotonic timers.
  * Generates newline-delimited JSON stream to `stdout`.
* **Component B: Node.js Communication Server**
  * Manages C child process lifecycle, stream demultiplexing, and state caching.
  * Full-duplex WebSocket broadcasting to connected clients.
* **Component C: Web Dashboard**
  * Vanilla JS, SVG rendering, live Resource Allocation Graph, and telemetry charts.

---

### Slide 5: Synchronization, Threads & Critical Sections
* **Thread Model:** Each philosopher executes as a distinct POSIX thread created with `pthread_create()`.
* **Critical Sections:**
  * Modifying fork ownership (`owner_id`, `is_available`).
  * Transitioning philosopher states and updating meal counters.
  * Admission queue operations in the Fair Monitor.
* **Synchronization Primitives Used:**
  * `pthread_mutex_t`: Ensures strict mutual exclusion on each fork.
  * `pthread_cond_t`: Blocks and signals threads based on resource availability without busy-waiting.

---

### Slide 6: Deadlock Scenario & Resource Ordering Prevention
* **The Deadlock Condition (Naive Left-First):**
  * Every philosopher grabs left fork first $\implies$ all 5 hold 1 fork and wait for the second.
  * Cycle formed: $P_0 \to F_1 \to P_1 \to F_2 \to P_2 \to F_3 \to P_3 \to F_4 \to P_4 \to F_0 \to P_0$.
  * All 4 Coffman conditions satisfied.
* **The Solution: Dijkstra's Resource Ordering:**
  * Global total order on resources: $F_0 \prec F_1 \prec F_2 \prec F_3 \prec F_4$.
  * Rule: Always acquire $\min(L, R)$ before $\max(L, R)$.
  * Philosopher 4 acquires $F_0$ first, then $F_4$.
  * **Result:** Resource Allocation Graph is an Acyclic Directed Graph (DAG). Deadlock is mathematically impossible!

---

### Slide 7: Starvation Scenario & Fair FIFO Synchronization
* **Why Resource Ordering Is Not Enough:**
  * Resource ordering prevents deadlock, but does NOT guarantee starvation-freedom.
  * Asymmetric OS thread scheduling can allow alternating pairs ($P_0, P_2$) to starve $P_1$.
* **The Solution: Fair FIFO Monitor:**
  * Centralized monitor with arrival queue (`fifo_queue`).
  * Hungry philosophers are registered in arrival order.
  * Admitted only if both forks are free AND no earlier conflicting thread is waiting.
  * **Result:** Guaranteed progress for every thread under finite eating duration ($t_{eat} \le T_{max}$).

---

### Slide 8: Interactive Dashboard & Live Visualization
* **Circular Table:** Live SVG vectors display fork ownership and request dependencies.
* **Resource Allocation Graph (RAG):** Displays real-time assignment and request edges.
* **Coffman Checklist:** Visual status for Mutual Exclusion, Hold & Wait, No Preemption, and Circular Wait.
* **Event Telemetry Stream:** Millisecond-accurate JSON logging of every lock acquisition, state transition, and release.

---

### Slide 9: Testing, Verification & Metrics
* **Automated C Unit Tests:** 27 / 27 assertions passed (100%).
* **End-to-End Integration Tests:** 7 / 7 test suites passed (100%).
* **Empirical Verification:**
  * Fork exclusivity: 0 instances of dual fork ownership.
  * Controlled deadlock: Circular wait deterministically triggered and detected in 500ms; stopped cleanly without crashing.
  * Fair FIFO meal distribution: $[10, 10, 10, 10, 10]$ across all 5 threads (spread = 0).

---

### Slide 10: Conclusion & Hackathon Impact
* **Summary of Achievements:**
  * Full-stack OS engineering: Native POSIX C + Node.js + WebSockets + SVG.
  * 3 implemented algorithms: Naive Baseline, Resource Ordering, and Fair FIFO Monitor.
  * Real-time RAG and Coffman condition tracking.
  * 100% automated test coverage with graceful teardown.
* **Educational Impact:** Provides students and evaluators an interactive, verifiable platform to explore core operating systems synchronization concepts.
