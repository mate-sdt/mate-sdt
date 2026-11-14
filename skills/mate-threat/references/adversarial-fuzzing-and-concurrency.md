# 💣 Adversarial Testing, Concurrency & Fuzzing Guide (`mate-threat`)

This guide outlines the patterns and heuristics for implementing **Pillar T (Threat & Trash)** test suites in `tests/threats/*.spec.ts`.

---

## 1. The 4 Core Adversarial Pillars

### 1. High-Concurrency Race Conditions (`@concurrency`)
* **Objective:** Verify that concurrent requests targeting the same scarce resource (stock, promo balance, seat reservation) serialize safely with optimistic/pessimistic locking.
* **Technique:** Use `Promise.all([request.post(...), request.post(...)])` to dispatch $N$ parallel HTTP calls in the exact same millisecond.
* **Expected Oracle:** Exactly 1 request succeeds (`200 OK` / `201 Created`); the remaining $N-1$ requests fail deterministically (`409 Conflict` or `422 Unprocessable Entity`).

### 2. Double-Click & Webhook Idempotency (`@idempotency`)
* **Objective:** Ensure automated network retries or frantic user clicks cannot generate duplicate side effects (e.g., double billing).
* **Technique:** Send identical requests with the same `Idempotency-Key` or payment token within $< 50\text{ms}$.
* **Expected Oracle:** The second request returns the cached result or a clean conflict without creating a secondary database record.

### 3. Payload Fuzzing & Boundary Stress (`@fuzzing`)
* **Objective:** Probe input sanitizers, database constraints, and JSON parsers for crash resilience.
* **Vectors to Test:**
  * **Negative & Boundary Numbers:** Negative balances, zero, `MAX_SAFE_INTEGER`, floating-point rounding attacks (`0.1 + 0.2`).
  * **String Injections:** SQLi fragments (`'; DROP TABLE ...`), XSS tags (`<script>alert(1)</script>`), shell metacharacters (`| & ; $`).
  * **Buffer & Memory Overflows:** Long strings ($10,000+$ chars), deeply nested JSON objects ($100+$ levels).
  * **Unicode & Encoding Stress:** Multi-byte emojis, right-to-left (RTL) override characters, null bytes (`\0`).
* **Expected Oracle:** Clean `400 Bad Request` or `422 Unprocessable Entity` with friendly JSON error payloads. **Zero HTTP 500s and zero stack-trace leakage.**

### 4. BOLA / IDOR Cross-Tenant Access (`@security`)
* **Objective:** Guarantee that User B cannot read, mutate, or delete User A's private resources.
* **Technique:** Perform authenticated calls using Tenant B's session against Tenant A's resource IDs.
* **Expected Oracle:** Deterministic `403 Forbidden` or `404 Not Found`.
