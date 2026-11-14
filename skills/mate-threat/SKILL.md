---
name: mate-threat
description: >-
  Specialist in Pillar T (Threat, Concurrency, Chaos & Fuzzing) of the M.A.T.E. Method.
  USE WHEN: Designing or executing adversarial tests in `tests/threats/` (race conditions, double-spend
  concurrency, webhook idempotency, payload fuzzing, SQLi/XSS, BOLA authorization, network faults).
  SYNERGY: Pairs with `mate-pw-forensics` (for multi-actor browser sessions `-s=actor1`, `-s=actor2`), receives
  `<threat_scenarios>` from `mate-model`, and hands off uncovered vulnerabilities to `mate-triage`.
---

# 💣 Pillar T Skill: Threat, Trash & Adversarial Testing (`mate-threat`)

This skill is responsible for **Pillar T (Threat & Trash)** of the M.A.T.E. Method. Its purpose is to shatter the illusion of the happy path and expose software to real-world chaos before release.

---

## 🔗 Skill Synergy & Handoff Protocol

| Direction | Skill | How They Work Together |
| :--- | :--- | :--- |
| **Upstream** | **`mate-model` & `mate-story-testcases`** | Supplies `<threat_scenarios>` (`THR-01..THR-NN`) and `STATE_TRANSITION` / concurrency test cases. |
| **Companion (Multi-Actor CLI)** | **`mate-pw-forensics`** | Launches simultaneous isolated browser sessions (`playwright-cli -s=buyer-a`, `-s=buyer-b`) to probe UI race conditions and stale-state overwrites interactively. |
| **Companion (API Layer)** | **`mate-assert-api`** | Uses `Promise.all()` with typed `BaseApiClient` instances to fire parallel HTTP mutations in the exact same millisecond. |
| **Downstream (Defects)** | **`mate-triage`** | Any vulnerability or race condition that exposes a security/integrity flaw is logged via `npx mate-sdt bug` and kept in `tests/threats/` with `test.fail()`. |

---

## 📋 Responsibilities of `mate-threat`

1.  **Threat Modeling and Adversarial Scenarios (`tests/threats/`):**  
    Inspects module specifications and discovers critical failure vectors:
    - **Concurrency & Race Conditions:** Simultaneous user actions, concurrent transactions executed in the exact same millisecond.
    - **Idempotency:** Automated network retries and duplicate webhooks (ensuring operations process exactly ONCE).
    - **Broken Object Level Authorization (BOLA / IDOR) & Multi-Tenant Isolation:** Verify that users and tenants cannot access unauthorized resources. Automated via Multi-Role and Multi-Tenant fixtures (`{ tenantAPage, tenantBPage }` or `asTenant()`).
    - **Data Trash & Fuzzing:** Massive payloads, SQL/NoSQL/XSS injections, negative balances, non-standard Unicode strings, and corrupted ISO timestamp formats.
2.  **Adversarial & Chaos Verification (`npx playwright test tests/threats/`):**  
    Pillar T enforces real-world black-box/gray-box adversarial engineering:
    - Multi-actor concurrent browser sessions (`playwright-cli -s=actor1`, `-s=actor2` via `mate-pw-forensics`).
    - Parallel API race-condition bursts (`Promise.all` with `BaseApiClient`).
    - Double-submit & webhook idempotency verification.
    - Boundary & payload fuzzing (`SQLi`, `XSS`, negative numbers, Unicode overflow, malformed JSON).
    - Network fault simulation and downstream gateway timeout/503 mocks.

---

## ⚡ Running Adversarial Suites

Execute the threat test suite using Playwright:
```bash
npx playwright test tests/threats/
```

---

## 🔄 Black-Box Handoff & Session Isolation

- **Separate Individual Histories:** Never pass raw multi-turn scratchpads or verbose upstream tool logs into this skill or out to downstream skills.
- **Consume & Emit `mate.handoff/v1`:** Read only the compressed upstream handoff digest + `npx mate-sdt context <module>` JIT pack, and advance stages via `npx mate-sdt session advance <flow-id> --stage=<next> --to=<skill> --digest="..."`.
- **Provenance & Hygiene:** Tag findings with `[BOOTSTRAPPED]`, `[USER_EXPLICIT]`, `[OBSERVED | ISO]`, `[INFERRED]`, or `[TBD]`; promote verified facts via `npx mate-sdt context <module> --consolidate`.

## Zero-Assumption Escalation & Sub-Agent Isolation Protocol

- **Ask, Never Guess (`STATUS: BLOCKED_ON_USER_INPUT`):** Inspect local context (`MATE-PROJECT-MAP.md`, `specs/`, code) and live browser/API responses first. Never invent business thresholds, auth boundaries, or SLA numbers. Tag any genuine requirement gap as `[TBD: <exact question for PO/Dev/QA>]` inside `## Open Questions for Human QA`, finish all unblocked work, and halt when `npx mate-sdt validate` or `npx mate-sdt gate` returns `STATUS: BLOCKED_ON_USER_INPUT` to ask the human.
- **Sub-Agent Context Isolation (`--subagent` & `mate.handoff/v1`):** When delegating to a sub-agent or running a multi-stage pipeline (Reader/Extractor -> Spec Scorer -> Code Writer -> Independent Reviewer), build a scoped prompt via `npx mate-sdt context <module> --subagent <skill-name>` (`.mate/subagent-prompt-<module>-<skill>.md`). Pass only the structured `mate.handoff/v1` digest between stages (or run `--compact` in single-agent IDEs) so raw exploratory noise never pollutes downstream context windows.
