# Dining Philosophers Deadlock Prevention System
### Concurrency, Synchronization, Deadlock Elimination, and Starvation Prevention Suite

[![Build & Test](https://img.shields.io/badge/C%20Unit%20Tests-46%2F46%20Passed-brightgreen.svg)]()
[![Integration Tests](https://img.shields.io/badge/Integration%20Tests-8%2F8%20Passed-brightgreen.svg)]()
[![Platform](https://img.shields.io/badge/Platform-Ubuntu%20Linux%20%7C%20WSL2-blue.svg)]()
[![Threads](https://img.shields.io/badge/Concurrency-POSIX%20pthreads-orange.svg)]()
[![License](https://img.shields.io/badge/License-MIT-purple.svg)]()

---

## 📌 Project Information

* **Project Title:** Dining Philosophers Deadlock Prevention System
* **Team Name:** OCTO_OSSP
* **Team Members:**
  1. **G Jashwanth Reddy** — System Architect & C Engine Concurrency Lead
  2. **Mohammad Zaid Amaan** — Communication Server & IPC Protocol Lead
  3. **M Pramod Krishna** — Systems Visualization & Telemetry Lead
* **Official Problem Statement:**
  > *"Implement and visualize different synchronization strategies to prevent deadlock and starvation among competing processes/threads."*
* **Target Environment:** Ubuntu Linux (Native) or Ubuntu under WSL2 on Windows.

---

## 🏛️ System Architecture

The project is structured as three decoupled, production-quality components communicating via standard I/O streams and WebSockets:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      COMPONENT C: WEB DASHBOARD                        │
│   (HTML5, CSS3, Vanilla JS, SVG Vector Rendering, WebSocket Client)    │
│   • Circular Table (P0-P4 & F0-F4) • Live RAG Graph • Telemetry Charts │
└────────────────────────────────────▲───────────────────────────────────┘
                                     │  WebSocket (Full-Duplex JSON)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 COMPONENT B: NODE.JS COMMUNICATION SERVER              │
│   (Express.js, ws WebSocket Server, Process Supervision, State Cache)  │
│   • Manages C Engine (Linux/WSL) • Stream Buffering • Broadcast Hub    │
└────────────────────────────────────▲───────────────────────────────────┘
                                     │  Standard I/O Streams (JSON Lines)
                                     │  stdin: Commands | stdout: Events
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     COMPONENT A: C SIMULATION ENGINE                   │
│   (POSIX pthreads, pthread_mutex_t, pthread_cond_t, FIFO Monitor)      │
│   • 5 Independent Concurrent Threads • 3 Synchronization Algorithms    │
│   • Deadlock Detector • High-Resolution Monotonic Telemetry Stream     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Synchronization Strategies Implemented

### 1. Naive Left-First Approach (Deadlock-Prone Baseline)
* **Strategy:** Every philosopher attempts to lock their left fork first, then their right fork.
* **Controlled Deadlock Demonstration:** A POSIX synchronization barrier (`pthread_barrier_t`) deterministically aligns all 5 philosophers to acquire their left fork simultaneously before requesting the right fork.
* **Circular Wait:** Forms the classic Coffman dependency cycle:
  $$P_0 \to F_1 \to P_1 \to F_2 \to P_2 \to F_3 \to P_3 \to F_4 \to P_4 \to F_0 \to P_0$$
* **Safe Recovery:** In demo mode, threads poll with `pthread_mutex_trylock` in small intervals, allowing clean cancellation and recovery without hanging the host machine.

### 2. Resource Ordering (Dijkstra's Hierarchy — Deadlock Prevention)
* **Strategy:** Imposes a global total order on all shared resources: $F_0 \prec F_1 \prec F_2 \prec F_3 \prec F_4$.
* **Ordering Rule:** Every philosopher acquires $\min(L, R)$ before $\max(L, R)$.
  * Philosophers 0, 1, 2, and 3 acquire their lower fork then higher fork.
  * Philosopher 4 requires $F_4$ and $F_0 \implies$ **acquires $F_0$ first, then $F_4$!**
* **Deadlock-Free Proof:** Because resource acquisition index increases monotonically along any chain of wait dependencies, the Resource Allocation Graph is guaranteed to be a Directed Acyclic Graph (DAG). **Circular wait is mathematically impossible**.

### 3. Fair FIFO Monitor (Starvation-Free Synchronization)
* **Strategy:** Monitor-based admission controller with condition variables (`pthread_cond_t`) and a request arrival queue (`fifo_queue`).
* **Admission Rule:** A hungry philosopher is admitted if and only if both forks are free **AND** no earlier waiting philosopher in the FIFO queue competes for either fork.
* **Fairness Guarantee:** Eliminates starvation under finite dining periods ($t_{eat} \le T_{max}$), providing equal dining throughput across all five threads.

---

## 🚀 Quick Start Guide

### Prerequisites
* **Ubuntu Linux** or **Windows with WSL2 (Ubuntu)**
* **GCC Compiler & GNU Make:**
  ```bash
  sudo apt update && sudo apt install -y build-essential gcc make
  ```
* **Node.js (v18+) & npm:**
  ```bash
  sudo apt install -y nodejs npm
  ```

---

### Step-by-Step Launch Commands

#### Option 1: One-Click Startup Script (Linux / WSL)
```bash
chmod +x start.sh
./start.sh
```

#### Option 2: Windows Batch Script
Double-click `start.bat` or run in PowerShell:
```cmd
start.bat
```

#### Option 3: Manual Execution
1. **Compile the C Engine:**
   ```bash
   cd c-engine
   make clean && make
   cd ..
   ```
2. **Install Server Dependencies:**
   ```bash
   cd server
   npm install
   cd ..
   ```
3. **Start the Application:**
   ```bash
   node server/server.js
   ```
4. **Open in Browser:**
   Navigate to [http://localhost:3000](http://localhost:3000).

---

## 🧪 Automated Testing & Verification

The suite includes two complete automated testing harnesses:

### 1. C Synchronization Unit Tests (27 Assertions)
Tests mutual exclusion invariants, progress in resource ordering, deadlock detection barriers, and fair FIFO starvation bounds:
```bash
cd c-engine
make test
```
*Expected Output:*
```
Test Results: 27 / 27 assertions passed (ALL TESTS PASSED)
```

### 2. End-to-End System Integration Tests (7 Scenarios)
Tests process management, stream buffering, command parsing, pause/resume, deadlock recovery, and WebSocket snapshots:
```bash
npm run test:integration
```
*Expected Output:*
```
Integration Test Results: 7 / 7 tests passed!
```

---

## 📊 Live Dashboard Features

* **Circular Dining Table:** Interactive SVG vectors connecting acquired forks to owning philosophers.
* **Philosopher State Machine:** Real-time color-coded indicators:
  * 🔵 **THINKING:** Contemplating (randomized sleep).
  * 🟡 **HUNGRY:** Waiting to acquire forks.
  * 🟠 **WAITING:** Holding 1 fork, blocked on second.
  * 🟢 **EATING:** Holding both forks with active pulse.
  * 🔴 **DEADLOCKED:** Flashing crimson alert indicating circular wait.
* **Resource Allocation Graph (RAG):** Live tracking of process-to-resource request edges and assignment edges.
* **Coffman Condition Checklist:** Real-time diagnostics for Mutual Exclusion, Hold & Wait, No Preemption, and Circular Wait.
* **Fairness Distribution Chart:** Dynamic per-philosopher bar chart displaying meal counts.
* **C Engine Event Stream:** Filterable, millisecond-accurate JSON log stream.

---

## 📁 Repository Directory Structure

```
Dining_Philosophers_Deadlock_Prevention_System/
├── c-engine/                          # Component A: POSIX C Simulation Engine
│   ├── src/
│   │   ├── types.h                    # Core data structures & synchronization primitives
│   │   ├── events.h / events.c        # Thread-safe JSON Lines emitter
│   │   ├── synchronization.h / .c     # 3 synchronization algorithms & deadlock watcher
│   │   ├── philosopher.h / .c         # Philosopher thread lifecycle
│   │   └── main.c                     # Engine entrypoint & command loop
│   ├── tests/
│   │   └── test_synchronization.c     # 27 automated C synchronization unit tests
│   └── Makefile                       # GCC build configuration (-Wall -Wextra -pthread -O2)
├── server/                            # Component B: Node.js Communication Server
│   ├── services/
│   │   └── engine_manager.js          # Child process manager & stream demultiplexer
│   ├── routes/
│   │   └── api.js                     # REST endpoints (/api/status, /api/command)
│   ├── package.json                   # Express & ws WebSocket dependencies
│   └── server.js                      # Main HTTP & WebSocket server
├── frontend/                          # Component C: Web Dashboard
│   ├── index.html                     # Responsive UI layout & control panels
│   ├── styles.css                     # Dark OS theme, glowing animations, SVG styles
│   └── app.js                         # WebSocket client, table rendering & telemetry
├── docs/                              # Comprehensive Project Documentation
│   ├── system-architecture.md         # Detailed three-tier architectural specification
│   ├── synchronization-algorithms.md  # Mathematical proofs & algorithm analysis
│   ├── testing-report.md              # Complete test logs & verification matrix
│   ├── project-report.md              # Formal 23-section academic project report
│   ├── demo-script.md                 # Rehearsed live hackathon demonstration script
│   ├── presentation.md                # Slide-by-slide presentation markdown
│   └── presentation/index.html        # Interactive 10-slide HTML presentation deck
├── tests/
│   └── integration_test.js            # Automated Node.js end-to-end integration test
├── start.sh                           # Linux/WSL one-click launch script
├── start.bat                          # Windows one-click launch script
├── package.json                       # Root npm scripts
├── .gitignore                         # Build artifact and dependency exclusions
└── README.md                          # Project documentation
```

---

## 🧑‍💻 Presentation & Live Demonstration

* **Interactive Slide Deck:** Open `docs/presentation/index.html` in any browser for an interactive 10-slide presentation deck.
* **Live Demo Script:** See [`docs/demo-script.md`](docs/demo-script.md) for speaking notes and step-by-step role distribution for G Jashwanth Reddy, Mohammad Zaid Amaan, and M Pramod Krishna.

---

## 🛠️ Troubleshooting

* **WSL Path Issues on Windows:** The server automatically translates Windows paths to `/mnt/<drive>/...` when spawning `wsl.exe`.
* **Port Conflict on 3000:** Set an alternative port using `PORT=8080 node server/server.js`.
* **Permission Denied on start.sh:** Run `chmod +x start.sh`.
* **Missing GCC in WSL:** Run `sudo apt install -y gcc make`.

---

## 📜 Academic Integrity & License

This project was built for the **OCTO_OSSP Hackathon** by **G Jashwanth Reddy**, **Mohammad Zaid Amaan**, and **M Pramod Krishna**. Released under the [MIT License](LICENSE).