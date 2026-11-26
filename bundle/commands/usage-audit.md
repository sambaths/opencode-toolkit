---
description: Read-only project token, cost, model, and tool usage audit through the local OpenCode API
agent: manager
subagent: false
---

Audit OpenCode usage for the requested project without editing: $ARGUMENTS

Read `.opencode/tools/usage-audit.md` first for the API contract, privacy boundary, options, bounds, and failure behavior. Run the installed standalone tool with an explicit canonical project root:

```sh
node .opencode/tools/usage-audit.mjs --root /absolute/project --days 7 --format markdown --tools summary --timezone UTC
```

Use `--format json` when the caller needs structured output and `--tools detail` only when per-tool rows are requested. The tool resolves the project's registered `Project.ID` through `GET /api/project` before requesting scoped session statistics. Do not substitute a path-derived ID, call provider APIs, inspect transcripts, or read credentials.

Report only the emitted token/cache/reasoning counts, cost, per-model usage, and tool totals/detail. Preserve truncation and limitation statements. The CLI invocation may start a service or use a configured remote server, and an agent-run report enters the current model context; prefer direct terminal use when that context exposure is unwanted. Missing CLI/server/project data, malformed responses, timeouts, and bound failures are errors, not zero usage. Stop after the audit unless a separate change is authorized.
