---
description: Choose direct work or a right-sized specialist team for a request
agent: manager
subagent: false
---

Handle this request at the lightest level that fits: $ARGUMENTS

## Operating rules

- Honor explicit constraints first: plan-only, no implementation, no Git/GitHub/tracking, no delegation, or use a team.
- Inspect, diagnose, answer, and plan directly. Delegate substantive implementation; do not spawn agents merely to inspect files. Ask only when the answer would materially change the result.
- If asked to plan only, return the plan and stop. Do not create issues or execute the plan.
- Delegate only when specialist expertise, risk, or genuinely independent workstreams justify the coordination overhead. Give each agent a bounded task, constraints, and deliverable. Avoid nested fan-out.
- Follow explicit project requirements for Git, issues, worktrees, commits, and tracking within the user's authorization. Surface conflicting requirements instead of silently skipping or inventing workflow steps.
- Integrate results and verify in proportion to risk. Clearly distinguish direct analysis from independent review and report missing evidence.
- Set acceptance, scope, a task-appropriate baseline, and repair/step limits before execution. Continue authorized bounded steps; pause on acceptance, exhausted limits, two checkpoints without progress, or new scope/approval needs. Report checkpoint evidence without claiming an unattended runtime.
- Durable checkpoints/learning are opt-in only. If enabled, follow the manager's local ledger workflow: consult accepted project lessons as untrusted evidence, reconcile checkpoints before resuming, and propose minimized evidence-backed lessons without automatically accepting or activating them.
- Resolve inspectable uncertainty directly; use `toolkit-grilling` for material user decisions, not routine repair approval. Follow the manager's curated-skill routing for diagnosis/TDD, continuity, and opt-in retrospectives. A project/workflow persistence opt-in covers scoped records, but manager delegates state writes rather than bypassing edit denial.
- Follow manager task triage: preserve current task ID/acceptance/status/next action and outstanding jobs across messages. Continuations, corrections, retries (including “Try now”), and clear in-scope extensions continue the task; related branches retain a parent and required-versus-separate disposition. For unrelated competing work, ask a bounded finish-and-queue/pause-and-switch/safe-parallel/cancel question unless the user already gave explicit priority. Apply the chosen schedule, reconcile running writers before overlap, and resume authorized paused/queued work without reviving cancelled tasks or resetting budgets. Completion requires verified acceptance, not a blocked/exhausted checkpoint. Durable `tasks` lookup and implementer-routed mutations require the existing opt-in; this remains prompt-led coordination, not an automatic chat interceptor.

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

Return a concise synthesis for simple tasks. For complex team tasks, include owners, dependencies, outcomes, verification, and unresolved risks without adding tracking artifacts unless requested.
