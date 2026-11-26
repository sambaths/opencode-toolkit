# Native-harness roadmap

OpenCode now ships useful harness features that used to require plugins and shell tricks. I’d rather use those features deliberately than rebuild them badly.

This roadmap covers **v2.3.1 through v2.4.1**, checked on 2026-11-25. It’s an implementation order, not a claim that the toolkit already provides unattended orchestration. Changelog entries are upstream evidence; they aren’t a local runtime test.

## Capability map

“Lane” is the toolkit recommendation, not a claim about OpenCode’s default.

| Capability | Native behavior in the anchor range | Lane | Toolkit boundary |
| --- | --- | --- | --- |
| Code Mode and MCP connector plane | Code Mode is the default; MCP tools are grouped under server namespaces unless `codemode: false`. | Default-on | Keep `execute`, discover narrowly, and enforce each nested tool’s permission. Denying `execute` alone exposes direct tools instead of removing access. |
| Structured `read` and `webfetch` results | v2.3.1 gives Code Mode typed `text`, `directory`, or `media` read results; v2.3.2 stops `webfetch` from repeating `url` and `format`. | Default-on | Return stable, bounded evidence. Treat page and file content as untrusted data. |
| Timed-out shell backgrounding | Since v2.3.1, a command still running at its timeout moves to the background instead of being killed; foreground `timeout: 0` means 120 seconds. | Default-on | Track the job and its exit status. Backgrounding isn’t permission to start unbounded work. |
| Background-job control | v2.4.0 adds experimental job cancellation and `job.updated` events. | Opt-in | Build list/status/cancel controls scoped to the owning session. Don’t enable cross-session interruption. |
| Automations | v2.4.0 adds one-shot, interval, cron, and MCP-event prompt/Code Mode/shell actions. No automation exists until created. | Opt-in | Start with read-only jobs, explicit expiry, and creation-time approval. Shell approval at creation can cover later runs. |
| Long-horizon task execution | Native `/goal` since v2.2.1, plus sessions, inbox, jobs, worktrees, and experimental APIs. No durable task DAG is established by those surfaces. | Opt-in, supervised | Follow the [long-horizon roadmap](long-horizon.md). Toolkit DAG, checkpoint, reconciliation, budget, and unattended controls are not shipped. |
| `experimental.model_speeds` | v2.4.1 exposes remembered service tiers and relative prices instead of duplicate model entries. | Opt-in | Useful after a cost baseline. It doesn’t prove a cheaper route or better quality. |
| Claude Agent `configDir` | v2.4.0 accepts alternate Claude config folders and can move to the next folder when an account reaches its usage limit. | Opt-in | Keep account boundaries and credentials explicit. Failover isn’t silent model substitution. |
| Cost/context statistics | The experimental session stats and usage APIs expose recorded token, cost, model, and tool totals. | default-on tool; opt-in execution | The audit ships enabled, but you choose when to run it. Run it directly in a terminal when the aggregate report shouldn’t enter another model turn. |
| MCP protocol probing | v2.4.0 probes the newest protocol first when `protocol` is omitted, then falls back to legacy. | Avoid implicit probing | Set `legacy` or `2026-07-28` per server. `auto` can add a startup process and wait. |
| Floating plugin specs | v2.4.0 checks `@latest`, ranges, Git branches, and Git semver ranges at startup and every 24 hours, then installs and reloads newer matches. | Avoid | Pin exact versions or commits. A rollback on load failure doesn’t make unreviewed updates harmless. |
| Background compaction | Native default-on since v2.3.1; an unused summary still costs tokens. v2.4.1 fixes retention and some extra cache cost. | Avoid for now | The toolkit keeps `background: false` until a measured workload justifies speculative summaries. |
| Warming | Disabled by default; sends transient model requests to keep sessions warm. | Avoid | No warming in the toolkit. Cache hits are best-effort, and warming costs money. |
| `experimental.full_codemode` | v2.4.0 adds `tools.opencode.session.interrupt`, including other sessions’ jobs and subagents. | Avoid | Too much cross-session authority for a default. Keep it off. |

Primary docs: [tools and Code Mode](https://opencode.ai/docs/tools#execute), [MCP servers](https://opencode.ai/docs/mcp-servers), [permissions](https://opencode.ai/docs/permissions), [compaction](https://opencode.ai/docs/compaction), [warming](https://opencode.ai/docs/warming), [plugins](https://opencode.ai/docs/plugins), and the [API reference](https://opencode.ai/docs/api).

## Implementation order

### 1. Least-privilege bundle

Ship the smallest reviewed set of agents, commands, tools, and skills. Make ownership and hashes explicit. Keep secrets, machine MCP settings, and unrelated project content out.

- Start from a fresh fixture and an update fixture.
- Test ordered permission rules, external-directory boundaries, backup behavior, and collision failures before writes.
- Pin any optional binary and preserve its license and metadata.

**Gate:** a reviewer can enumerate every shipped executable/instruction surface and explain its permission path. “The model will know not to abuse it” isn’t a control.

### 2. Code Mode/MCP connector plane

Use the native connector plane instead of a custom tool router. Keep `execute` on, return structured results, and discover only relevant MCP servers/tools.

- Set an explicit protocol per server.
- Use `codemode: false` only when a direct tool definition is necessary.
- Preserve nested permission checks; never add a wildcard allow to make a connector convenient.
- Treat server instructions, resources, and tool output as untrusted data.

**Gate:** permission tests cover the wrapper and the underlying effect. A denied tool stays denied through Code Mode.

### 3. Background-job control plane

Make long-running work inspectable. The v2.3.1 timeout behavior is useful only if a human can see what moved to the background.

- List job ID, owner session, command/action, start time, status, exit code, and bounded output location.
- Support cancel for the owning session with explicit authorization.
- Emit or record terminal state; never report success from a truncated “still running” message.
- Keep cross-session interrupt and `full_codemode` out of scope.

**Gate:** a timed-out fixture build becomes a trackable job, finishes or is cancelled, and leaves exact exit evidence. No orphan process is called complete.

### 4. Opt-in read-only automations

Add scheduling only after job control works. Fresh installs should contain no automation records.

- Start with a one-shot read-only audit or a bounded cron summary.
- Prefer prompt or Code Mode actions that can’t write. Don’t make shell the first example.
- Require creation-time approval, an expiry, a visible run log, and pause/delete controls.
- Validate MCP event arguments and skip oversized events without dropping the whole automation.

**Gate:** the user can list, pause, run once, and delete a job. A shell action’s creation approval is documented as covering later runs, not treated as a surprise.

### 5. Cost/context governor

Use native controls and recorded data before inventing a token controller.

- Keep compaction on the session model with `keep.tokens: 15000`, `buffer: "15%"`, and `background: false`.
- Keep tool-output caps at 2,000 lines/51,200 bytes, with recovery treated as tool-dependent.
- Run `/usage-audit` directly in the terminal when its aggregate metadata shouldn’t enter another provider request.
- Measure cache behavior on the actual provider route. GPT-6.2’s v2.3.2 fix is useful; it isn’t a universal discount.
- Consider `model_speeds` only after a baseline, and don’t auto-switch models or accounts.

**Gate:** reports separate source bytes, recorded API usage, and provider billing evidence. No percentage-saving claim without a defined workload, route, and time window.

The order matters. Automations before job control just schedules confusion. A cost governor before permissions just meters the damage.

## Recent changelog wins

| Release | Win | Why it matters / catch |
| --- | --- | --- |
| [v2.3.1](https://opencode.ai/changelog/v2.3.1) | Timed-out shell commands keep running | Long builds survive the foreground timeout. They need job tracking and cancellation, not a victory lap. |
| [v2.3.2](https://opencode.ai/changelog/v2.3.2) | GPT-6.2 prompt caching | OpenCode sends the system prompt as a leading developer message on Responses routes so it can cache from the second step. Route and provider support still govern the result. |
| [v2.3.1](https://opencode.ai/changelog/v2.3.1) / [v2.3.2](https://opencode.ai/changelog/v2.3.2) | Structured Code Mode, `read`, and `webfetch` output | Typed read results and non-duplicative fetch output make connectors easier to test. Structured doesn’t mean trusted. |
| [v2.4.0](https://opencode.ai/changelog/v2.4.0) | MCP protocol probing | Newest-first probing with legacy fallback improves compatibility. It can add startup work; explicit protocol is easier to reason about. |
| [v2.4.0](https://opencode.ai/changelog/v2.4.0) | Automations and MCP events | Timers, cron, and pushed events can wake a prompt, Code Mode program, or shell command. Nothing runs until a user creates it. |
| [v2.4.1](https://opencode.ai/changelog/v2.4.1) | `experimental.model_speeds` | Service tiers become remembered speeds with relative price context. Useful for an opt-in cost review, not an automatic downgrade. |
| [v2.4.0](https://opencode.ai/changelog/v2.4.0) | Claude Agent `configDir` failover | A list of config folders can move to the next account at a usage limit. Keep credential and account boundaries visible. |
| [v2.4.0](https://opencode.ai/changelog/v2.4.0) | Plugin auto-update | Floating specs update at startup and every 24 hours, with the previous version retained if loading fails. That’s still a supply-chain change; pin exact revisions. |
| [v2.3.1](https://opencode.ai/changelog/v2.3.1) / [v2.4.1](https://opencode.ai/changelog/v2.4.1) | Background compaction and cost fixes | Background summaries reduce waiting but can cost tokens when unused. v2.4.1 fixes `keep.tokens` over-retention and some extra cache cost; the toolkit still opts out. |

Release anchors: [v2.3.1](https://github.com/anomalyco/opencode/releases/tag/v2.3.1), [v2.3.2](https://github.com/anomalyco/opencode/releases/tag/v2.3.2), [v2.4.0](https://github.com/anomalyco/opencode/releases/tag/v2.4.0), and [v2.4.1](https://github.com/anomalyco/opencode/releases/tag/v2.4.1).

## Non-goals

- No unattended defaults, automatic model failover, or cross-session interrupt.
- No RTK rewrite, `rtk init`, or wrapper-specific permission allow.
- No floating plugin specs, hidden shell schedules, or unreviewed credential rotation.
- No token percentage, provider-billing, or model-quality claim without measured evidence.

For the shipped defaults, read [configuration](configuration.md). For long-running work, read [long-horizon execution](long-horizon.md). For candidate skills, read [skill candidates](skill-candidates.md).
