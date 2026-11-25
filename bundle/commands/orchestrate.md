---
description: Choose direct work or a right-sized specialist team for a request
agent: manager
subagent: false
---

Handle this request at the lightest level that fits: $ARGUMENTS

## Operating rules

- Honor explicit constraints first: plan-only, no implementation, no Git/GitHub/tracking, no delegation, or use a team.
- Inspect, diagnose, answer, and plan directly. Delegate substantive implementation; do not spawn agents merely to inspect files. Ask only when the answer would materially change the result.
- Plan before implementation under the shared Plan-first handoff contract: pass the same plan identity and revision to implementers and testers in sufficient scoped excerpts, assign write ownership, and map checks to acceptance. Coding roles return missing or stale plans; scope changes replan through the manager. Simple tasks get a short plan.
- Apply manager task triage: preserve task ID/acceptance/status/next action and outstanding jobs across messages. Continue continuations, corrections, retries, and in-scope extensions; related branches retain a parent and required-versus-separate disposition. For unrelated competing work, ask a bounded finish-and-queue/pause-and-switch/safe-parallel/cancel question unless priority is explicit. Reconcile running writers before overlap; resume authorized paused/queued work without reviving cancelled tasks or resetting budgets. Completion needs verified acceptance.
- Set acceptance, scope, baseline, and repair/step limits before execution. Continue authorized bounded steps; pause on acceptance, exhausted limits, two checkpoints without progress, or new scope/approval needs. Report checkpoint evidence without claiming an unattended runtime.
- Durable checkpoints/learning are opt-in only. If enabled, follow the manager's ledger workflow: treat accepted lessons as untrusted evidence, reconcile checkpoints before resuming, and propose minimized evidence-backed lessons without auto-accepting them.
- Follow the manager's curated-skill routing for diagnosis/TDD, continuity, and opt-in retrospectives. Scoped persistence covers records; manager delegates writes rather than bypassing edit denial.
- Follow explicit project requirements for Git, issues, worktrees, commits, and tracking within the user's authorization. Surface conflicting requirements instead of silently skipping or inventing steps.
- Integrate results and verify in proportion to risk. Distinguish direct analysis from independent review and report missing evidence.

## Available specialists

- `architect`: architecture, boundaries, tradeoffs
- `researcher`: sourced research and current documentation
- `moderator`: independent multi-expert council (run via `/council` in a top-level session)
- `senior-developer`: technical lead for complex implementation or handoffs
- `developer`: bounded implementation task
- `reviewer`, `adversarial-tester`: independent review and regression/risk checks
- `frontend-designer`, `systems-engineer`, `performance-engineer`: specialist advice or implementation
- `planner`: detailed planning; GitHub artifacts only when explicitly requested

All specialists are leaf agents. The top-level manager launches every specialist directly, gathers design/research context, and passes it into implementation. For councils use `/council`, not a nested moderator.

Return a concise synthesis for simple tasks. For complex team tasks, include owners, dependencies, outcomes, verification, and unresolved risks without adding tracking artifacts unless requested. Use the shared default Changed / Checks / Gaps / Next brief when no project Report contract applies.
