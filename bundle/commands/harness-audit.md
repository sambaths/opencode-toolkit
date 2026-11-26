---
description: Evidence-backed audit of agent, command, permission, dependency, and optimization configuration consistency
agent: manager
subagent: false
---

Audit the requested harness scope without editing: $ARGUMENTS

Inspect effective configuration sources, agents, commands, shared instructions, manifests, and referenced dependencies. Check duplicate definitions, ordered permission overrides, role/capability conflicts, delegation depth, command targets, missing files/tools/skills, portability, and project-policy conflicts. Read only what the audit needs; do not open credential files or transcript content.

Include these explicit optimization checks:

- **Model/cache compatibility:** for Claude models reached through an OpenAI-compatible provider, inspect provider/model settings for `compatibility.cacheFormat: 'anthropic'`. Verify the actual route before recommending it; a provider name alone is not evidence. Report missing or conflicting settings and distinguish catalog defaults from local overrides.
- **MCP Code Mode and tool surface:** check each configured MCP server for `codemode: false`, then inventory enabled tools, servers, plugins, and broad permissions. Flag disabled Code Mode or unnecessarily broad catalogs as context/cost risks. Static config does not prove the runtime-advertised surface; label live-tool evidence separately.
- **Compaction:** inspect top-level `auto`, `keep.tokens`, `buffer`, and `background`, plus `agents.compaction.model` only when the user configured it. The toolkit default is 15000 kept tokens, `15%` buffer, and background `false`; it does not force a compaction model. Explain user deviations rather than overwriting them. Check root/local/global ownership before claiming local effectiveness: a preserved non-empty local `.opencode` value retains precedence over the project-root value, while a removed toolkit-generated local value leaves the root value in control.
- **Tool output:** inspect `tool_output.max_lines` and `tool_output.max_bytes` for positive, intentional caps. The toolkit defaults are 2000 lines and 51200 bytes. Discuss hidden diagnostics and verification risk; caps are not a substitute for scoped commands.
- **Warming cost:** inspect provider warming settings and identify real billable warm-up requests. The toolkit leaves warming unchanged; report enabled warming as a cost/latency tradeoff, not free caching.
- **RTK permission boundary:** confirm automatic rewriting/plugin/init integration remains off. If RTK is present, verify only the managed binary/metadata boundary statically. A wrapped command is a different permission resource from the bare command, so do not treat RTK as preserving ask/deny matching or use it to bypass approval.

Inventory native OpenCode harness features and opportunities, not just toolkit files:

- **Task tracking and delegation:** inspect `experimental.todo` and `experimental.subagent_depth`; distinguish a visible task list from authoritative state, and identify where shallow delegation is safer than unbounded fan-out.
- **Location lifecycle:** inspect `experimental.location_idle_timeout`, snapshots, and worktrees. Identify cleanup, persistence, isolation, and recovery implications; snapshot/worktree creation is an action, not a read-only audit step.
- **Policy architecture:** compare ordered `permissions` with any policy layer, plugins, host rules, and agent/session overrides. State which source is expected to win and where runtime evaluation is still required.
- **Plugins and automations:** inventory installed plugins, automation triggers/actions, and background jobs. Classify unattended execution, network/admin effects, credential access, scheduling, and spend as consent-gated; the safe default is off without explicit authorization.
- **Session flow:** inspect inbox, steering, queue, background-session, and wait behavior. Identify interruption, ordering, duplicate-work, and lifecycle risks before proposing autonomy.
- **Native/local compaction and Code Mode:** identify which runtime owns compaction and tool discovery, whether local compaction is available, and how Code Mode changes the advertised surface. Do not assume a second compactor or token controller is safe.
- **Warming and usage statistics:** inspect warming and the experimental session-stats surface. Separate real billable requests, cached-token accounting, and aggregate metrics from prompts/content; use the standalone usage audit when measurement is authorized.

Classify opportunities as **safe default**, **opt-in autonomy**, or **remain off without explicit consent**. Safe defaults may include bounded reads, explicit task state, shallow delegation, intentional output caps, and aggregate usage reporting. Opt-in autonomy includes worktrees, snapshots, queue/background changes, broader tools, and policy changes. Unattended automation, plugins, warming, publishing/admin actions, and unbounded background jobs remain off without explicit consent; do not enable them during the audit.

Review recent runtime changes as default-on, opt-in, or avoid rather than assuming documentation and behavior match:

- **Default-on fixes to verify:** timed-out shell commands may continue in the background instead of being killed; Code Mode has structured `read`/search results and `webfetch` deduplication; MCP servers are probed with the newest protocol before legacy fallback; GPT-6.2 system-prompt caching changed on Responses routes. Verify actual process lifecycle, schemas, protocol, and cache accounting at runtime—docs may lag.
- **Opt-in:** automations and the plugin automation API, `experimental.full_codemode` session interruption, `experimental.model_speeds`, and Claude Agent `configDir`/account failover expand autonomy or account routing and need explicit consent.
- **Avoid or pin/review:** plugin version-range auto-updates execute changing third-party code, so prefer exact reviewed pins; background compaction can spend tokens on an unused summary, so keep the toolkit's `background: false` unless the cost tradeoff is accepted.

Sources: [changelog](https://opencode.ai/changelog), [v2.4.1](https://opencode.ai/changelog/v2.4.1), [v2.4.0](https://opencode.ai/changelog/v2.4.0), [v2.3.2](https://opencode.ai/changelog/v2.3.2), [v2.3.1](https://opencode.ai/changelog/v2.3.1), and the corresponding [v2.4.1](https://github.com/anomalyco/opencode/releases/tag/v2.4.1), [v2.4.0](https://github.com/anomalyco/opencode/releases/tag/v2.4.0), [v2.3.2](https://github.com/anomalyco/opencode/releases/tag/v2.3.2), and [v2.3.1](https://github.com/anomalyco/opencode/releases/tag/v2.3.1) release pages.

Use current official documentation for runtime semantics: [models](https://opencode.ai/v2/docs/models), [configuration](https://opencode.ai/v2/docs/config), [MCP servers](https://opencode.ai/v2/docs/mcp-servers), [compaction](https://opencode.ai/v2/docs/compaction), [CLI commands](https://opencode.ai/v2/docs/cli/commands), [API/session statistics](https://opencode.ai/v2/docs/api#tag-session), [permissions](https://opencode.ai/v2/docs/permissions), [plugins](https://opencode.ai/v2/docs/plugins), [API reference](https://opencode.ai/v2/docs/api), [OpenAPI](https://opencode.ai/v2/openapi.json), [config worktrees](https://opencode.ai/v2/docs/config#worktrees), and [worktree tools](https://opencode.ai/v2/docs/tools#worktrees). [awesome-llm-token-optimization](https://github.com/pleasedodisturb/awesome-llm-token-optimization) is research inspiration only, not authority for this runtime or proof of savings.

A **strict unattended profile is roadmap only**, not enabled by this release: an explicit read-only tool allowlist, shell denied by default, scoped filesystem/network boundaries, approval for side effects, and spend/run limits. The existing broad interactive shell permissions remain unchanged in 0.2.0; do not describe them as an unattended security boundary.

Label each finding **static** or **runtime evidence**. Static findings cite exact paths/lines and loaded configuration precedence; runtime findings cite the read-only command/API observation and timestamp. Never invent numeric scores, claim deterministic evaluation, infer live behavior from prompts, or run a missing audit script. Return severity-ranked findings with impact, suggested fixes, and limitations. Stop after evaluation unless fixes are separately requested.
