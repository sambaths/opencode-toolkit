# Long-horizon execution roadmap

A long task needs more than a session that keeps talking. It needs durable task state, visible jobs, a checkpoint that survives compaction, and a reviewer who didn’t write the code.

This is a **roadmap, not shipped unattended execution**. OpenCode has useful native pieces; the toolkit doesn’t yet provide the full control plane described here.

## Native pieces and the gaps

| Native capability | What OpenCode provides | Gap the toolkit still owns |
| --- | --- | --- |
| `/goal` | Since [v2.2.1](https://opencode.ai/changelog/v2.2.1), a session can continue toward an objective until a reviewer confirms it, with pause/resume/clear controls. | The changelog doesn’t establish a durable task DAG, `dependsOn` semantics, checkpoint rehydration contract, or per-task budget enforcement. |
| Sessions and subagents | Stable session IDs, background subagents, parent notifications, message/context/log routes, and typed client contracts. | A session is not a task record. The toolkit must bind tasks to sessions without guessing from titles or transcript order. |
| Events and inbox | Live execution, permission, compaction, usage, and job events; inbox items can steer or queue input. | Client subscriptions are live-only with no replay or automatic reconnect. Reconciliation must query current state after a missed event. |
| Jobs and shells | Experimental job listing/cancellation, `job.updated`, shell listing/output, and native backgrounding for timed-out shell commands. | Toolkit job list/status/cancel controls and task-level reconciliation are planned, not shipped. |
| Worktrees | Project-scoped create/list/refresh/remove operations and session moves. | A worktree isolates files, not credentials, network access, task state, or permissions. It isn’t a sandbox. |
| Compaction | Lossy summaries, retained recent context, stored history, and explicit compaction events. | A summary is not a checkpoint. Task state must live outside the model context and be rehydrated deliberately. |
| Automations | One-shot, interval, cron, and MCP-event actions since v2.4.0. | Triggers aren’t dependencies. No automation should be created until task/job reconciliation and review gates exist. |
| Usage statistics | Recorded token, cost, model, and tool totals through experimental APIs. | Session aggregates aren’t per-task accounting, and recorded cost isn’t a provider invoice or a hard pre-spend limit. |

Primary contracts: [JavaScript client and event semantics](https://opencode.ai/docs/build/client), [SDK host lifecycle](https://opencode.ai/docs/build/sdk), [session/job/inbox/worktree API](https://opencode.ai/docs/api), [tools and subagents](https://opencode.ai/docs/tools#subagent), and [compaction limits](https://opencode.ai/docs/compaction#limits).

The community [OpenCode goal plugin](https://github.com/william-ricchiuti/OpenCode-goal-plugin) is useful research, not a dependency. It is in maintenance mode because native `/goal` exists. Its [changelog](https://github.com/william-ricchiuti/OpenCode-goal-plugin/blob/main/CHANGELOG.md) documents hard-won lessons about leases, recovery, compaction, evidence-gated completion, and independent verification. It’s MIT-licensed, but this toolkit doesn’t bundle or install it.

## LH1 — Bound the objective and authority

**Owner:** manager with the user.

**Artifacts:** `LONG-HORIZON-CHARTER.md` with the objective, acceptance criteria, non-goals, allowed effects, approval boundaries, budget, and stop conditions.

**Done when:** the user can say what “done” means, what the agent may change, and what makes it stop. A goal without an authority boundary is just a loop with good posture.

**Boundary:** no auto-continuation, publishing, deployment, or credential use is implied by a goal statement.

## LH2 — Build the task DAG

**Owner:** planner or architect; manager approves.

**Artifacts:** a versioned ledger where each task has `id`, `dependsOn`, owner, acceptance criteria, budget, risk, and status. The graph is acyclic and has an explicit root.

**Done when:** every task is reachable from the root, every dependency is necessary, and the ready set is deterministic. Parallel tasks have separate write ownership.

**Boundary:** don’t encode dependencies in prompt prose and hope the model remembers. Don’t let a blocked dependency silently become optional.

## LH3 — Bind sessions and checkpoint

**Owner:** manager or developer.

**Artifacts:** a checkpoint with task ID, project/worktree, native session IDs, known job IDs, ledger revision/hash, last observed event sequence, open questions, and next allowed action.

**Done when:** a fresh process can identify the task and its authoritative state without reading the whole transcript. Recovery starts paused, not guessing.

**Boundary:** checkpoints are untrusted data. Validate schema, hashes, paths, and ownership before rehydration. Keep credentials and raw private transcripts out.

## LH4 — Execute and reconcile

**Owner:** developer or loop-operator under manager supervision.

**Artifacts:** task attempts with exact commands, native job/session IDs, exit status, bounded output location, inbox decisions, actual time/cost, and blocker reason.

**Done when:** every started task is completed, failed, cancelled, or explicitly blocked. Every job is accounted for, including jobs that outlived a turn or reconnect.

**Boundary:** after a missed event, query current session/job/shell state before launching anything. “I didn’t see it finish” is not a terminal state.

## LH5 — Independent review gate

**Owner:** reviewer or adversarial tester who didn’t implement the change.

**Artifacts:** an evidence map from each acceptance criterion to tests, diffs, logs, and runtime observations, plus a verdict and unresolved findings.

**Done when:** every acceptance has evidence, high-severity findings are closed or explicitly accepted by the user, and the review is newer than the last relevant change.

**Boundary:** the implementer can’t approve its own work. A reviewer without edit/shell authority can still read evidence; it shouldn’t need write access to judge it.

## LH6 — Close or hand off

**Owner:** manager.

**Artifacts:** final ledger state, completed/blocked/cancelled tasks, actual budgets, residual jobs, backup/recovery notes, and the next concrete action.

**Done when:** no owned job is silently running, the user gets a concise outcome, and unfinished work has an owner and reason. Commit, push, release, and tracker updates remain separate requests.

**Boundary:** “session idle” doesn’t mean “task complete.” Close only from ledger and evidence, not model confidence.

## Current P0/P1 limits

### P0 — What’s allowed now

- Supervised, bounded work with a human checkpoint between phases.
- Read-only inspection of native state when useful.
- Manual task notes and existing toolkit verification/review surfaces.
- Native `/goal` only as an explicitly chosen OpenCode feature; the toolkit doesn’t configure or promise unattended execution.

### P1 — What’s deliberately missing

- No durable task DAG or dependency scheduler.
- No toolkit job reconciliation/control plane.
- No checkpoint rehydration protocol.
- No per-task hard cost/time budget enforcement.
- No strict unattended profile and no automatic resume after restart.
- No unattended write, publish, deploy, or cross-session interrupt path.

That’s the honest limit. A native goal loop plus a long prompt is not the same thing as a resumable task system.

## Optional read-only observations

These are observations, not an unattended controller. The CLI may start the service or use a configured remote server, and experimental routes can change.

| Observation | Native route/surface | Catch |
| --- | --- | --- |
| Sessions and active work | `GET /api/session`, `GET /api/session/active`, `GET /api/session/{id}` | Presence doesn’t prove task ownership or completion. |
| Context and messages | `GET /api/session/{id}/context`, `GET /api/session/{id}/message` | May expose private content; don’t copy it into a public ledger. |
| Inbox | `GET /api/session/{id}/inbox` | Steering/queue state can change while you read it. |
| Jobs and shells | `GET /api/experimental/job`, `GET /api/shell`, `GET /api/shell/{id}/output` | Experimental and potentially sensitive; query again after reconnect. |
| Events | `GET /api/event` | Live-only, no replay. Buffer slow consumers and resubscribe after failure. |
| Worktrees | `GET /api/worktree` | Inventory isn’t proof that a worktree is clean or safe. |
| Usage | `GET /api/experimental/session/stats` | Aggregate recorded data, not a hard budget or invoice. |

Do not call create/prompt/interrupt/cancel/delete routes as part of an “observation.” Those are effects and need their own authorization.

## Safety boundaries

- No `full_codemode` cross-session interrupt in a long-horizon profile.
- No unattended shell schedule, plugin update, model/account failover, or warming.
- No secrets in checkpoints, ledgers, logs, or issue text.
- No automatic retry of a mutating action unless its idempotence and authority are proven.
- No completion from a compacted summary alone.
- No task transition that bypasses a dependency or independent review gate.

## Concrete future design

Nothing in this section is implemented yet. The proposed CLI names and file seams below are a build contract, not current commands.

### Ledger schema v2 and migration

Extend the existing [opt-in task ledger](../bundle/tools/task-state.md), not a second task database.

- `schemaVersion: 2` adds a checkpoint `plan` object and extends `task`; v1 records stay readable.
- Migration validates the whole v1 ledger, writes a backup, then performs one locked atomic revision. Corrupt/foreign/unsupported state fails closed. There is no silent downgrade or field stripping.
- Existing v1 task fields remain: `status`, `relation`, `parent`, `budgetUsed`, `jobs`, and optional `completionEvidence`.
- New task fields are `dependsOn`, `milestones`, `isolation`, `progress`, and `stop`. `budgetUsed` expands beyond repairs/steps; `jobs` gains native IDs and reconciliation evidence.
- A new record `kind: "evidence"` stores concise, hashed observations. It never stores raw transcripts, credentials, or unlimited logs.

| Field | Proposed shape | Rule |
| --- | --- | --- |
| `plan` | `{ revision, goal, nonGoals, seams, risks, assumptions, baseline, limits }` | Full plan is required to resume. `seams` names owned paths/interfaces; `baseline` records the starting tree/checks; `limits` includes steps, repairs, time, tokens, and cost. |
| `dependsOn` | Existing task IDs | No self-links, missing tasks, or cycles. A dependency is satisfied only by a terminal accepted state, not by prose. |
| `milestones` | `{ id, acceptance, status }[]` | Status is `pending`, `active`, `passed`, `failed`, or `waived`. A waiver needs user authority and a reason. |
| `isolation` | `{ worktree, writeScope, network, credentials }` | Worktree and write scope are explicit. Network/credential access defaults to denied for unattended work. |
| `jobs` | Native job/session IDs, owner, status, write scope, timestamps | `running`, `reconciling`, `finished`, `failed`, or `cancelled`. Unknown stays unresolved; a ledger status is not a process signal. |
| `budgetUsed` | `{ steps, repairs, tokens, costUsd, elapsedMs }` | Cumulative and monotonic. Unknown is not zero. Resume doesn’t reset it; raising a limit needs new authorization. |
| `progress` | `{ passedMilestones, totalMilestones, lastEvidenceID, updatedAt }` | Derived from milestones/evidence, not free-form confidence. |
| `stop` | `{ reason, at, resumeAuthority }` or `null` | A stop preserves state and blocks new dispatch until the named authority resumes it. |
| `completionEvidence` | Evidence IDs | Required for completion, current for the plan revision, and empty of unresolved jobs. |

An evidence record should carry `task`, optional `milestone`/`acceptance` IDs, `result` (`pass`, `fail`, or `inconclusive`), a concise `summary`, `observedAt`, `provenance`, and an artifact reference with size/hash where available. Hashes detect change; they don’t prove the observation is true.

### Ready and resume are read models

Proposed commands:

```sh
node .opencode/tools/task-state.mjs --project /absolute/project ready
node .opencode/tools/task-state.mjs --project /absolute/project resume fix-parser
node .opencode/tools/task-state.mjs --project /absolute/project resume fix-parser --format packet \
  | node .opencode/tools/context-tools.mjs pack --root /absolute/project
```

- `ready` returns a deterministic list of queued tasks whose dependencies are satisfied, budgets remain, no job is unresolved, and no stop/review gate blocks them. It includes plan revision, isolation, acceptance, and remaining budget. It does not dispatch.
- `resume` returns the full checkpoint, plan, dependency/milestone state, evidence digest, jobs needing reconciliation, and next allowed action. It does not resume anything.
- Both are bounded, read-only views. No model call, timer, daemon, shell command, or state write happens in them.

The existing [context packer](../bundle/tools/context-tools.md) remains the composition boundary. A future `resume --format packet` maps the plan into its schema: `nonGoals` and safety rules become `constraints`; `seams` become `scope`/`ownership`; `dependsOn` becomes `dependencies`; `risks`, `assumptions`, `baseline`, and `limits` remain explicit. The packer validates paths, line ranges, size caps, and sensitive-file refusals. It must not read `.toolkit-state` directly; the ledger emits a sanitized packet and the packer reads only approved project excerpts.

### One state-writer delegate

The manager plans and reads. One authorized implementer delegate owns ledger writes for a task, recorded as `stateWriter` with role/session identity and the current ledger revision.

- Every write uses the existing lock plus `--expect REV`; a conflict means reread and reconcile, not overwrite.
- Native observation adapters never write the ledger. They return reports to the delegate.
- The reviewer records a verdict through the delegate or a separate authorized review write, never by editing state files directly.
- `stateWriter` is caller-declared accountability, not authentication. Host permissions and user authority still enforce the boundary.

There is no scheduler or daemon. The manager chooses the next ready task, asks for authorization, and dispatches through existing tools. A read model must never turn into a hidden loop.

### Queue versus steer

| Native inbox mode | Ledger meaning | Required behavior |
| --- | --- | --- |
| `queue` | Add ordered input without changing the active task. | Keep the current plan revision. The queued item waits for a safe boundary and doesn’t authorize a new task or dependency bypass. |
| `steer` | Change the active instruction. | Pause new dispatch, record the inbox ID and new instruction, invalidate the current review digest, and require plan reconciliation before more work. |

Rejected permission requests, user messages, and model/agent switches are steer-class interruptions. They aren’t “quiet progress.” Resume needs the manager’s explicit reconciliation and the original authority boundary.

### Job cancellation is a reconciliation protocol

1. Record cancel intent with native job ID, owner session, reason, authority, and timestamp.
2. Mark the ledger job `reconciling`; don’t remove it and don’t call it cancelled yet.
3. If separately authorized, call the native cancel route once. A failed/unknown request stays unresolved.
4. Query current job/shell/session state after the request and after any reconnect.
5. Mark terminal only with fresh evidence. Unknown remains unresolved and blocks duplicate dispatch or completion.

Pausing or cancelling a ledger task is not a kill signal. Native job status is an observation, not proof that filesystem/network effects stopped.

### Review digest binds the exact work

Compute a canonical digest over:

```text
SHA-256(plan revision + milestone IDs/statuses + evidence IDs/hashes + reviewed diff hash)
```

Canonical means versioned JSON with sorted task/milestone/evidence IDs and explicit nulls; don’t let timestamps or map ordering change the digest. Store the digest, reviewer identity, verdict, timestamp, and unresolved findings. Any plan revision, milestone, evidence, or relevant diff change makes the review stale. Completion requires a current digest, passed/waived milestones with authority, `completionEvidence`, and no unresolved jobs. The implementer can’t supply the independent verdict.

## Exact future file seams

These are proposed paths; they are not created by this roadmap.

| Future seam | Owned change |
| --- | --- |
| `bundle/tools/task-state.mjs` | Schema v2 migration, evidence records, DAG/milestones/isolation/budget/progress/stop, `ready`, `resume`, packet output, single-writer/revision rules. |
| `bundle/tools/task-state.test.mjs` | Migration, graph, read-model, writer, queue/steer, budget, cancel, and review-digest regressions. |
| `bundle/tools/task-state.md` | v2 schema, migration/recovery, CLI read models, and writer contract. |
| `bundle/tools/context-tools.mjs` | Accept the v2 packet fields and preserve all plan constraints/acceptance/verification while enforcing existing pack bounds. |
| `bundle/tools/context-tools.test.mjs` | Ledger-packet composition, stale line ranges, sensitive-state refusal, and bounded output. |
| `bundle/tools/long-horizon.mjs` | Read-only native session/job/shell/inbox observation adapter and reconciliation report. No scheduler, daemon, prompt, or ledger write. |
| `bundle/tools/long-horizon.test.mjs` | Fake API contract, live-only event loss, reconnect reconciliation, cancel intent, and unknown-state handling. |
| `bundle/tools/long-horizon.md` | Operator runbook, safety profile, and recovery examples. |
| `bundle/commands/long-horizon.md` | Prompt workflow for LH1–LH6; no unattended default. |
| `bundle/agents/manager.md` | Ready-task selection and one-writer delegation rules. |
| `bundle/agents/loop-operator.md` | Queue/steer, stop, budget, and job-reconciliation behavior. |
| `bundle/agents/reviewer.md` | Digest-bound independent verdict and stale-review rules. |
| `scripts/export.mjs` | Explicitly allowlist the new tool, tests, guide, and command. |
| `bin/validate.mjs` | Validate new command/agent references and required artifacts. |

## LH-01–LH-17 acceptance groups

| ID | Expected outcome |
| --- | --- |
| LH-01 | Existing v1 ledgers and checkpoints remain readable without rewriting or inventing task state. |
| LH-02 | V2 migration is validated, backed up, locked, atomic, and fail-closed; downgrade is rejected. |
| LH-03 | `dependsOn` rejects missing links/cycles and produces a deterministic ready set. |
| LH-04 | Milestones and `progress` agree; waivers require authority and a reason. |
| LH-05 | `isolation` enforces declared worktree/write scope and denies undeclared unattended network/credential access. |
| LH-06 | Tasks bind immutable native session/job IDs; no ancestry is inferred from titles. |
| LH-07 | Evidence records validate, redact, bound, and hash observations without storing raw secrets/transcripts. |
| LH-08 | Resume restores the full `plan`/`nonGoals`/`seams`/`risks`/`assumptions`/`baseline`/`limits` and starts paused. |
| LH-09 | `ready` is read-only, deterministic, budget-aware, and never dispatches. |
| LH-10 | `resume` is bounded, read-only, exposes unresolved jobs/stops, and never starts a session. |
| LH-11 | Context-tools pack composition preserves constraints and acceptance, rejects stale/sensitive selections, and never reads ledger state directly. |
| LH-12 | One state-writer delegate, exclusive lock, and `--expect REV` prevent conflicting writes; manager/native adapters stay read-only. |
| LH-13 | Queue preserves the active plan; steer pauses dispatch and invalidates review until reconciliation. |
| LH-14 | Cancel intent moves jobs to `reconciling`; only fresh native terminal evidence closes them. Unknown blocks duplicate dispatch. |
| LH-15 | `budgetUsed` is monotonic across resume; unknown cost/time fails closed for unattended work and overshoot is reported. |
| LH-16 | Review digest is bound to plan revision, milestones, evidence, and diff; any relevant change makes it stale. |
| LH-17 | Completion requires current review/evidence and no unresolved jobs; no scheduler/daemon or silent unattended resume exists. |

Ship supervised recovery first. A longer leash can wait.

## Sources

- [OpenCode V2 client contract](https://opencode.ai/docs/build/client), [SDK overview](https://opencode.ai/docs/build/sdk), and [API reference](https://opencode.ai/docs/api)
- [Native `/goal` changelog, v2.2.1](https://opencode.ai/changelog/v2.2.1) and [release](https://github.com/anomalyco/opencode/releases/tag/v2.2.1)
- [Compaction](https://opencode.ai/docs/compaction), [tools/subagents/worktrees](https://opencode.ai/docs/tools), and [automations changelog, v2.4.0](https://opencode.ai/changelog/v2.4.0)
- [OpenCode goal plugin](https://github.com/william-ricchiuti/OpenCode-goal-plugin), [changelog](https://github.com/william-ricchiuti/OpenCode-goal-plugin/blob/main/CHANGELOG.md), and [MIT license](https://github.com/william-ricchiuti/OpenCode-goal-plugin/blob/main/LICENSE)
- [Native-harness roadmap](harness-roadmap.md) and [configuration defaults](configuration.md)
