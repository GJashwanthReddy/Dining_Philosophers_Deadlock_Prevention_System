# Live Hackathon Demonstration Script
## Dining Philosophers Deadlock Prevention System
**Team Name:** OCTO_OSSP  
**Team Members:**  
* **Speaker 1:** G Jashwanth Reddy (System Architecture & C Concurrency Lead)  
* **Speaker 2:** Mohammad Zaid Amaan (IPC Protocol & Communication Server Lead)  
* **Speaker 3:** M Pramod Krishna (Systems Visualization & Analytics Lead)  
**Total Estimated Time:** 5 – 7 minutes  

---

## Demonstration Sequence

### Step 1: Introduction & Architecture Overview (1 minute)
* **Speaker 1 (G Jashwanth Reddy):**
  > "Good morning, respected judges and professors. We are Team OCTO_OSSP. Today, we present our Dining Philosophers Deadlock Prevention and Starvation Prevention System.
  > Unlike simulated browser toys, our system runs genuine, multi-threaded C code compiled with GCC and POSIX pthreads on Ubuntu Linux, connected via an incremental JSON stream over WebSockets to this live OS visualization dashboard.
  > Let us walk through the architecture: Component A is the native C engine executing the philosopher threads. Component B is our Node.js communication gateway. Component C is our real-time SVG dashboard."

---

### Step 2: Normal Concurrency & Mutex Protection (1 minute)
* **Speaker 2 (Mohammad Zaid Amaan):**
  > "I will now launch the simulation by clicking **Start** under **Resource Ordering**.
  > Notice what happens immediately: Five independent POSIX threads are spawned. The table shows their real-time state machine: Blue for Thinking, Amber for Hungry, Orange for Waiting, and Emerald for Eating.
  > Each fork is protected by an actual POSIX mutex (`pthread_mutex_t`). A fork cannot be owned by more than one philosopher at any time. When Philosopher 0 eats, they lock Fork 0 and Fork 1. Their neighbors, Philosophers 4 and 1, are blocked until those mutexes are unlocked."

---

### Step 3: Controlled Deadlock Demonstration (1.5 minutes)
* **Speaker 1 (G Jashwanth Reddy):**
  > "Now, we will demonstrate how uncoordinated synchronization causes system deadlock.
  > I will click **Trigger Deadlock Demonstration**.
  > This switches to our Naive Left-First baseline. In this educational mode, all five philosophers become hungry and acquire their left fork first.
  > Notice the table: Every philosopher holds one fork and is blocked waiting for their right fork.
  > Look at our Resource Allocation Graph and Coffman checklist:
  > Condition 1: Mutual Exclusion is active.
  > Condition 2: Hold & Wait is active—each philosopher holds one fork and waits for the next.
  > Condition 3: No Preemption—forks cannot be forcibly stolen.
  > Condition 4: Circular Wait has formed: $P_0 \to F_1 \to P_1 \to F_2 \to P_2 \to F_3 \to P_3 \to F_4 \to P_4 \to F_0 \to P_0$.
  > All four Coffman conditions hold. The system is completely deadlocked. Notice that our application does not crash or hang—our watcher thread detects the cycle, emits a JSON alert, and allows safe recovery."

---

### Step 4: Deadlock Prevention via Resource Ordering (1 minute)
* **Speaker 2 (Mohammad Zaid Amaan):**
  > "I will now click **Resolve & Switch to Resource Ordering**.
  > Immediately, the deadlock dissolves and all philosophers resume dining!
  > Why? Because Dijkstra's Resource Ordering establishes a strict global hierarchy: every philosopher must acquire $\min(L, R)$ before $\max(L, R)$.
  > For Philosopher 4, whose forks are 4 and 0, they must request Fork 0 first! If Fork 0 is held by Philosopher 0, Philosopher 4 is blocked *before* picking up Fork 4. Fork 4 remains free for Philosopher 3.
  > Mathematically, the Resource Allocation Graph becomes an acyclic directed graph (DAG). Circular wait is broken, making deadlock impossible."

---

### Step 5: Starvation Prevention via Fair FIFO Monitor (1.5 minutes)
* **Speaker 3 (M Pramod Krishna):**
  > "However, deadlock prevention alone does not guarantee fairness. Under resource ordering, OS scheduling can cause asymmetric wait times.
  > Let us switch to our third algorithm: **Fair FIFO Monitor**.
  > Look at the **Meal Distribution Chart** on the right. In this mode, hungry philosophers enter an arrival queue managed by a monitor with condition variables (`pthread_cond_t`).
  > A philosopher is only admitted if both forks are free AND no earlier waiting philosopher in the queue is competing for those forks.
  > Look at our live chart: Meals are distributed with near-zero disparity across all five philosophers, proving that starvation is eliminated under finite dining durations."

---

### Step 6: Telemetry, Logs, and Graceful Teardown (1 minute)
* **Speaker 3 (M Pramod Krishna):**
  > "Looking at the bottom panel, we see the live C engine event log streaming machine-readable events with millisecond timestamps.
  > Finally, when I click **Stop**, the server sends `STOP` down standard input. All threads exit their loops, release their mutexes, are joined cleanly via `pthread_join()`, and the process terminates with zero leftover orphan processes.
  > In conclusion, our team has built a complete, genuine POSIX concurrency demonstration that combines theoretical Operating Systems rigor with production-grade engineering."

---

## Q&A Quick Reference for the Team

* **Q: Why didn't your C engine crash when deadlocked?**
  * *A (G Jashwanth Reddy):* In demo mode, threads poll using `pthread_mutex_trylock` in small sleep intervals checking a volatile `stop_requested` flag, allowing clean cancellation without unsafe thread killing.
* **Q: How does the monitor guarantee FIFO fairness without deadlocking?**
  * *A (Mohammad Zaid Amaan):* The monitor lock (`monitor_mutex`) protects the admission decision atomically. Since fork allocation and queue inspection happen inside the monitor, threads never hold one fork and wait for another uncoordinated.
* **Q: Can this scale beyond five philosophers?**
  * *A (M Pramod Krishna):* Yes, the C data structures and SVG layout use dynamic trigonometric coordinates $2\pi/N$ and dynamic arrays, supporting higher counts cleanly.
