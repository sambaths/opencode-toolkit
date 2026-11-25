# OpenCode Toolkit

Reusable project-local OpenCode V2 agents and commands. Node.js 20+ and npm are
required. OpenCode must already be installed. Provider credentials are not
included; the installer sets a default thinking/coding model profile that can be
overridden per project.

## One-command installation

Run from the project where you want to install or update the toolkit:

```sh
npx --yes github:sambaths/opencode-toolkit --project .
```

Installation **replaces matching toolkit files and definitions**, including local
customizations, except restrictive permission migrations described below. Previous contents are backed up automatically. Unrelated files
and configuration are retained. No extra overwrite flag or npm publication is
needed. GitHub package installation requires Git and network access.

For reproducible installs, use a release tag or commit rather than the moving
default branch: `npx --yes github:sambaths/opencode-toolkit#COMMIT --project .`
(replace `COMMIT` with a published commit SHA).

Preview without writing:

```sh
npx --yes github:sambaths/opencode-toolkit --project . --dry-run
```

The default install also provisions managed RTK OSS v1.2.1 at
`.opencode/vendor/rtk/` from a pinned HTTPS asset; `--no-rtk` is optional and skips
it. Supported targets: `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`,
and `win32-x64`. It installs no plugin, `rtk init`, automatic command rewriting,
PATH entry, or permission change; see [RTK install behavior](bundle/tools/rtk-install.md).

For local/offline source use, install package dependencies first, then run
`node /path/to/toolkit/bin/install.mjs --project /path/to/project --no-rtk`.
`--no-rtk` is the optional opt-out from the default managed RTK download; the
normal one-command install needs no extra flag.

## Model profiles

Each project gets a persistent thinking/coding model profile. Fresh installs and
updates from manifests without a profile receive these defaults:

| Tier | Default selector | Used by |
| --- | --- | --- |
| thinking | `google/gemini-4-hydrogen` | Coordination, planning, review, research, and read-only analysis |
| coding | `opencode/deepseek-v4.1-flash` | Implementation, tests, docs, build resolvers, and infrastructure changes |

Choose one or both tiers during install or update:

```sh
npx --yes github:sambaths/opencode-toolkit --project . \
  --thinking-model 'openai/gpt-6.1-sol#high'
npx --yes github:sambaths/opencode-toolkit --project . \
  --coding-model 'provider/model#variant' \
  --thinking-model 'google/gemini-4-hydrogen'
```

A selector is `provider/model` with an optional `#variant`. Empty, malformed, or
whitespace-padded selectors are rejected before any files are written. Passing
one flag changes only that tier and retains the saved selector for the other;
omitting both retains the saved pair. The pair is stored in
`.opencode/toolkit-manifest.json` and rendered into installed agent definitions,
so later updates and command runs use the same profile. `--dry-run` prints the
effective profile without writing.

Every shipped role has an explicit tier:

- **thinking:** manager, moderator, planner, architect, researcher, reviewer,
  adversarial-tester, performance-engineer, reverse-engineer, notetaker,
  tracker-sync, toolsmith, code-reviewer, security-reviewer,
  database-reviewer, docs-lookup, the Go/C++/Java/Kotlin/PHP/Python/Rust
  reviewers, and built-in `plan`, `general`, and `explore`.
- **coding:** `build`, developer, senior-developer, tdd-guide,
  build-error-resolver, the Go/C++/Java/Kotlin/Rust build resolvers,
  e2e-runner, doc-updater, refactor-cleaner, harness-optimizer, loop-operator,
  systems-engineer, and frontend-designer.

Mixed roles are classified by primary purpose: security-reviewer and
database-reviewer are review-first (thinking), while frontend-designer and
systems-engineer are implementation-capable (coding). When a review role finds
work that needs remediation, the manager should route it to a developer rather
than relying on a silent mid-task model switch.

The raw bundle templates stay model-neutral; only installed output receives a
`model` field. Built-in `plan`, `general`, and `explore` receive a model without a
`system` prompt, so their built-in prompts are not replaced. Existing unrelated
agent settings and JSONC comments are retained. Shipped commands do not set
`model`, so command execution uses an explicit command model if one is added
later, then the selected agent's configured model, then the current session
model. See [command execution](https://opencode.ai/docs/commands#execution).
A primary agent selected in an existing session has its own stored session
model; changing this profile does not rewrite that session by itself.

Model profile resolution is offline and does not verify provider credentials,
model availability, or variants. The default install also downloads a pinned RTK
OSS asset over HTTPS unless `--no-rtk` is passed; an intact managed install is
reused. There is no automatic failover or silent downgrade.
If a configured thinking model is unavailable, OpenCode should surface an
error/pause rather than switching models; rerun with an available
`--thinking-model` or continue with an explicitly chosen session model. This
project's tests cannot establish runtime availability.

## What gets installed

The installer writes `<project>/.opencode/`: 16 custom team roles, 24 retained
ECC agents (including the build override), model assignments for built-in
`plan`/`general`/`explore`, 23 commands, their prompts, shared instructions, six
curated skills, local ledger and context audit/packer tools/tests/evaluator, the
managed RTK OSS binary, and an ownership manifest. Matching agent/command
definitions in a project-root `opencode.json(c)` are removed to avoid duplicate
definitions; unrelated settings and comments remain intact. It never changes
your project's `AGENTS.md`, global OpenCode configuration, provider settings, or
application files. Plugins, project history, and machine MCP settings are excluded.

Additional skills, Context7, REA, browser tools, language tooling, and model providers are
optional external dependencies. Agents report missing capabilities rather than
installing them silently. These dependencies may be needed for particular tasks.

## Safety and updates

- Existing JSON/JSONC configuration is merged; unrelated settings and comments
  are retained. An existing default agent is preserved.
- Matching agent/command files and JSON definitions are replaced, whether previously
  installed by this toolkit or not. Legacy singular `agent/` and `command/` files
  with matching IDs are backed up and removed. Unrelated roles/commands remain.
- Existing root permission rules stay in place and are carried into local config.
  Existing ordered restrictive root/local rules (including repeated/overlapping
  matchers) and unrelated exceptions stay after the new baseline. Matching allows
  are absorbed at their baseline position so broad permits do not move after its
  approval safeguards; exact matcher effects use the stricter of existing and
  incoming `deny > ask > allow`. This may retain a more restrictive policy across
  updates rather than automatically relaxing it. Conflicting agent-scoped
  deny/ask migrations fail before writes unless the replacement permission array
  is identical; review/migrate them manually with explicit authorization.
  The installer reports static merge behavior, not effective runtime policy.
  Matching experimental settings such as delegation depth are updated too.
- Re-run the same install command to update, including customized toolkit files.
- Before overwriting or removing an existing file, its contents are saved under
  `.opencode/.toolkit-backups/<unique-install-id>/`, preserving project-relative
  paths. The printed backup path includes a `backup-manifest.json` listing files.
  Backups use private file permissions where supported and a local `.gitignore`
  because configuration backups may contain credentials. Do not force-add backups
  to Git or share them publicly. Copy selected files back manually to restore.
- All backups finish before any replacement/removal starts. New installs and
  unchanged reinstalls do not create backup snapshots.
- Dry-run lists planned paths without replacing files or creating backups. It is
  not a line-level diff.
- The manifest records the selected model profile, managed hashes of the rendered
  installed files, and configuration. Do not edit it to bypass ownership tracking.
  Files retired from a later bundle are not auto-deleted unless they conflict with
  an exported agent/command ID.
- Symlinked installation paths are refused. Individual writes use atomic rename;
  the entire installation is not a filesystem transaction. An I/O failure can
  leave a partial install; fix the cause and rerun.
- Review inherited global/ancestor/managed settings and any existing plugins.
  Static checks cannot prove the final effective runtime policy.

Shell is available to every role. Common destructive/publishing/admin command
patterns require approval. This is **not a sandbox** or exhaustive command firewall:
interpreters and scripts can also modify files. Read-oriented roles are constrained
by their instructions; edit-tool denial alone does not block shell-based writes.
All actions still require the user's scope/authorization. Use isolated environments
for untrusted code and stricter host policies when enforced read-only access matters.

OpenCode reloads configuration automatically; `/reload` forces a refresh. An
existing session retains its selected agent; select `manager` for coordination
or `build` for direct implementation.

## Workflows

- `/plan`: inspect and plan, then stop.
- `/orchestrate`: manager inspects directly and delegates bounded implementation.
- `/code-review`: independent reviewer, findings without fixes.
- `/council`: two independent rounds in a top-level moderator session.
- `/harness-audit`: evidence-backed configuration audit without a helper script.
- `/verify`: project-specific checks with honest evidence and limitations.

All specialists are leaves; the top-level manager/moderator owns fan-out. Project
requirements come from that project's instructions. Contradictory project policies
are surfaced rather than resolved by copying another project's workflow.

### Plan-first handoff

Before product, code, or test changes, the manager or planner (thinking tier)
authors a source-grounded plan: goal/scope/non-goals, affected files and seams,
ordered steps, acceptance IDs, baseline/verification commands, risks/assumptions,
and a repair limit. The manager passes the same plan identity and revision to
implementers and testers as sufficient scoped excerpts—shared goal, constraints,
and non-goals; relevant steps, dependencies, interfaces, and owned paths;
acceptance IDs with expected results; verification commands and evidence; and
remaining budget—or an existing authorized source. Same plan does not mean
identical text; an ID alone is insufficient for fresh child contexts, and
reviewers/testers receive the complete relevant cross-step requirements so an
excerpt cannot omit constraints or acceptance.

Direct `build`, developer/senior-developer, and implementation-capable retained
roles check the supplied plan before editing and return missing, stale, or
scope-changing plans to the manager instead of authoring a replacement on the
coding model. Reviewers and adversarial testers derive expected results
independently from requirements and project facts, then report plan or acceptance
gaps. Simple work gets a short plan.

Planning remains conversational unless the user or project asks to save it. No
tracker, file, or per-step approval gate is added; plan-only requests still stop
before implementation and Git/tracking. This is a prompt-level handoff contract,
not a plugin, runtime gate, or automatic enforcement. Static tests check the
presence and coherence of these instructions; they do not establish model
compliance or plan quality.

### Council → implementation

`/council <question>` selects **moderator** in the current top-level session;
`subagent: false` keeps it there. After the council, it **does not automatically
restore manager**. Run `/orchestrate <authorized next task>` to select manager for
implementation coordination, or use `/agents` to select manager manually. The
selected agent persists; `default_agent` is not an automatic return mechanism.
Recommendations are not implementation authorization, and a nested council does
not preserve the top-level independent workflow.

This follows current [V2 command execution documentation](https://opencode.ai/v2/docs/commands#execution).
The documented fields do not provide a return-agent/after hook. No auto-return
API/plugin integration is installed; the UI switch has not been tested here.

### Bounded execution and opt-in learning

Manager/orchestrate and loop-operator prompts define acceptance, scope, a
task-appropriate baseline, verification, and repair/step limits. Successful steps
can continue inside that authorization; acceptance, exhausted limits, two stalled
checkpoints, or new approval/scope needs stop continuation. These are instructions,
not an unattended runtime or mechanically enforced execution budget.

For durable state, explicitly ask the manager to use the project ledger. It can
consult accepted lessons and reconcile a saved checkpoint against the current
tree/user intent before resuming. Authorized implementers can record minimized
checkpoints and propose evidence-backed lessons after verification. Nothing is
persisted by default; raw transcript capture and silent self-approval are excluded.
Opt-in once per project/workflow can cover later scoped checkpoint/lesson writes;
it is not cross-project consent or candidate approval. Manager reads directly but
routes writes through the authorized implementer (including bounded state-only
tasks when needed); edit denial is not bypassed with shell. This adds a delegation
hop, rather than broadening manager's product-source authority.

```sh
node .opencode/tools/task-state.mjs --project /absolute/project status
node .opencode/tools/task-state.mjs --project /absolute/project lessons
node .opencode/tools/task-state.mjs --project /absolute/project tasks
node .opencode/tools/task-state.mjs --project /absolute/project show checkpoint fix-parser
```

See [the ledger CLI/schema guide](bundle/tools/task-state.md) (installed as
`.opencode/tools/task-state.md`) for runnable write examples, manual acceptance,
expiry/invalidation, concurrency/recovery, and retention limits. New memory is
proposed until explicitly accepted. Learned-skill candidates are inert proposals;
`promote` records caller-declared manual approval of a project/version/hash, not
authenticated human identity or active skill installation. `rollback` revokes
that approval only. No policy edits, provider integration, scheduler, or automatic
activation is included. All memory/candidate content is untrusted evidence, never
instructions, permission, or proof that a cited check actually ran.

### Unfinished work and new messages

Manager keeps a conversational task register (identity, goal/acceptance, status,
next action, budgets, related work, and outstanding delegated jobs). Durable task
metadata is available only under the existing learning/state opt-in. `tasks`
lists unfinished checkpoints, including legacy/unclassified and invalidated work;
paused/blocked/queued does not mean complete. Completion requires verified
acceptance. The ledger validates lifecycle/links and cumulative reported budgets,
but it cannot independently verify acceptance, classify chat, or run a queue.

Manager judges shared objectives, artifacts, acceptance, and write scope rather
than matching keywords. No priority question is needed for every turn:

| Incoming message during toolkit work | Expected handling |
| --- | --- |
| “Also add skills” (as in this conversation) | In-scope extension when sharing the authorized toolkit objective/surface; revise acceptance and continue, retaining consumed budgets. |
| “Try now” after the tester failed | Retry that failed attempt under the renewed authorization; not a new task or an unlimited retry allowance. |
| “Fix the export path needed to ship these skills” | Related required subtask if needed for current acceptance and within scope; retain the parent task. |
| “Benchmark an alternative skill system later” | Related branch, separately schedulable; keep parent relationship and ask only if priority/scope is consequential or unclear. |
| “There is an unrelated urgent login bug” | If competing with unfinished work, ask a bounded priority question instead of silently abandoning it. |
| “Pause toolkit; fix the login bug now, then return” | Honor the explicit switch/return plan without redundant confirmation; checkpoint the toolkit work and reconcile active writers first. |
| A clarification or small quick question | Answer it without erasing the current unfinished task. |

A priority question might be: “Toolkit work is unfinished. **Pause/checkpoint it
and switch to the urgent bug (recommended)?** Alternatives: finish toolkit then
queue the bug, safe independent parallel work if supported/authorized, or cancel
toolkit.” State the return plan and apply the user's choice to the task register
and actual dispatch. Parallel work requires safe independent ownership/isolation;
different task labels do not make overlapping writes safe.

Pausing/cancelling stops new dispatch, **not already-running children/processes**.
Retain their ownership and reconcile actual results/liveness before overlapping
writes. After selected work finishes, return to paused/queued work only under the
agreed authorization and original scope. Preserve explicit cancellations and
changed priorities; cancelled work is not automatically resurrected. These are
prompt-led coordination rules, not automatic chat interception or a new runtime.

### Curated, vendored skills

Six adapted skills ship as local content, not an npm/runtime dependency:

| Skill ID | When to use |
| --- | --- |
| `toolkit-grilling` | Material user decisions after inspectable uncertainty is resolved |
| `toolkit-questionnaire` | Necessary outside knowledge; draft questions, do not send |
| `toolkit-diagnosing-bugs` | Evidence-backed reproduction and diagnosis |
| `toolkit-tdd` | Project-appropriate regression-first implementation |
| `toolkit-handoff` | Long-task/session continuity with reconciled context |
| `toolkit-retro` | Verified-outcome lessons when learning is enabled |

Ask `@toolkit-grilling help decide the remaining API tradeoff`, or
`@toolkit-tdd fix this bug using our existing tests`. V2 advertises described,
permitted skills and the model can load them automatically when relevant; the
manager routes diagnosis/TDD into implementer handoffs and uses judgment instead
of asking about every routine step. Skill selection and bounded continuation are
prompt-led, not runtime guarantees; host permission checks still apply. See
[V2 skills](https://opencode.ai/v2/docs/skills) for discovery and explicit loading.

Content is adapted from [Matt Pocock's skills at pinned commit
abeeaf95660ba9e8b7c753eb38f441ca707a8823](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823).
See NOTICE.md and [bundled provenance](bundle/skills/provenance.json) /
[upstream license](bundle/skills/LICENSE.mattpocock.txt) for attribution and the
upstream MIT notice. No upstream checkout, network fetch, dependency install, or
automatic upstream update occurs when using these skills. Other skills remain
optional and unbundled. Unrelated local skill IDs are preserved; an unmanaged
directory colliding with a curated ID causes installation to fail before writes,
rather than silently taking ownership. Previously managed skill updates follow
the normal replacement/backup policy.

## Context and token efficiency

These prompts reduce repeated context and work without weakening planning, tests,
or independent review. Scoped plan packets, focused reads, proportional delegation,
evidence reuse, and delta reporting cut repeated source and status text. They are
instructions, not runtime token controls, quotas, or measured savings.

Prefer native scoped search, Git, JSON, and LSP capabilities when the runtime
provides them, without adding mandatory dependencies or skills. Default to compact
handoffs, focused tests, and delta reports while honoring explicit user scope and
project checks; these are prompt-level defaults, not a guarantee an agent runtime
follows them.

Concise-agent defaults affect visible output and repeated context, not guaranteed
internal reasoning or cost savings. They are prompt-level guidance, not a full
Caveman skill installation or a global short mode; project Report contracts,
required evidence, and user-specified verbosity still govern.

Primary platform sources (checked 2026-11-25):

- [Compaction limits](https://opencode.ai/docs/compaction#limits): fixed tool and
  instruction overhead remains even after compaction.
- [Background compaction](https://opencode.ai/docs/compaction#background-compaction):
  default on; summaries are lossy and cost tokens to produce. Disabling speculative
  background summaries is optional, not a guaranteed saving. This toolkit has no
  native compaction or token controller.
- [Skills loading](https://opencode.ai/docs/skills#loading): skill metadata is
  advertised, bodies load on demand, and support files are not auto-loaded.
- [Prompt caching](https://opencode.ai/docs/models#prompt-caching) and
  [Gemini caching](https://ai.google.dev/gemini-api/docs/caching): stable common
  prefixes can help best-effort cached billing and latency. Caching does not reduce
  logical tokens or context, and padding prompts to trigger it is counterproductive.
  Gemini ignores OpenCode's `cache.ttl`. DeepSeek's
  [automatic prefix caching](https://api-docs.deepseek.com/guides/kv_cache) does not
  establish behavior or billing on this OpenCode route.
- [Tool output limits](https://opencode.ai/docs/config#output): optional caps can
  hide diagnostics; prefer scoped commands and bounded reads.
- [Warming](https://opencode.ai/docs/warming): real billable requests; disabled by
  default and left unchanged.
- [MCP servers](https://opencode.ai/docs/mcp-servers): Code Mode is already the
  default; discover narrowly and return only needed data.

Optional local aids:

- [Context footprint audit and scoped packer](bundle/tools/context-tools.md): the
  audit reports UTF-8 source bytes, not tokens or live request loads; the packer
  reports what it omits. These are local tools, not a plan author, quality
  enforcer, or runtime controller.
- [RTK OSS binary guide](bundle/tools/rtk.md) and [install behavior](bundle/tools/rtk-install.md):
  the same single `npx` installation auto-provisions the managed RTK OSS binary,
  with no extra steps, and safe optimization behavior is the default. Automatic RTK
  command rewriting, plugin installation, and `init` remain OFF because upstream
  permission discovery does not read `.opencode/opencode.json(c)`; no runtime
  rewrite integration is claimed.

Default model flags, provider settings, and existing behavior stay unchanged. This
documentation makes no percentage-savings or runtime-enforcement promise.

## Development and verification

```sh
npm ci --ignore-scripts
npm test
npm run validate
node --test bundle/tools/*.test.mjs
npm pack
```

Installer integration tests cover fresh install, dry-run, JSONC, idempotency,
replacement/backups, unrelated-file preservation, symlink protection, exhaustive
model-tier assignment, partial overrides, persistence/switching, legacy profile
updates, invalid selectors before writes, and rendered file hashes. Bundle validation parses YAML,
checks references/routing, and detects duplicated definitions. Model availability,
live model behavior, and real Windows/macOS execution are not established by
Linux tests.
Ledger tests cover versioning, project scope, schema/corruption checks, acceptance,
expiry/invalidation, approval/revocation, concurrent writers, and path protections.
The existing skill evaluator scores supplied manifests, not live model runs.

Maintainers can re-export the explicit allowlist with
`node scripts/export.mjs /path/to/source/.opencode`; inspect the resulting diff
before committing. See NOTICE.md and LICENSE for upstream attribution.
