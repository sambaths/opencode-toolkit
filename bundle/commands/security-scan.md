---
description: Run AgentShield against agent, hook, MCP, permission, and secret surfaces.
agent: security-reviewer
subagent: true
---

# Security Scan Command

Run AgentShield against the current project or a target path. Turn its findings
into a prioritized remediation plan.

## Usage

`/security-scan [path] [--format text|json|markdown|html] [--min-severity low|medium|high|critical] [--fix]`

- `path`: defaults to the current project. Use a `.claude/` path, repo root, or checked-in template directory.
- `--format`: use `json` for CI, `markdown` for handoffs, and `html` for standalone reports.
- `--min-severity`: filters lower-priority findings.
- `--fix`: applies only fixes AgentShield marks safe and auto-fixable.

## Deterministic Engine

Prefer the packaged scanner:

```bash
npx ecc-agentshield scan --path "${TARGET_PATH:-.}" --format text
```

For local AgentShield development, run from its checkout:

```bash
npm run scan -- --path "${TARGET_PATH:-.}" --format text
```

Don't invent findings. Use AgentShield output as the source of truth, and separate
scanner facts from your follow-up judgment.

## Review Checklist

1. Check active runtime findings first:
   - hardcoded secrets
   - broad permissions
   - executable hooks
   - MCP servers with shell, filesystem, remote transport, or unpinned `npx`
   - agent prompts that handle untrusted content without defenses
2. Keep lower-confidence inventory separate:
   - docs and template examples
   - plugin manifests
   - project-local optional settings
3. For each critical or high finding, return:
   - file path and severity
   - runtime confidence
   - why it matters
   - exact remediation
   - whether it's safe to auto-fix
4. If `--fix` is requested, state the planned edits before applying them.
5. Re-run the scan after fixes and report the before/after score.

## Output Contract

Return:

1. Security grade and score.
2. Counts by severity and runtime confidence.
3. Critical/high findings with exact paths.
4. Lower-confidence findings in a separate group.
5. Remediation order.
6. Commands run and whether the scan was local, CI, or npx-backed.

## CI Pattern

Use AgentShield in GitHub Actions for enforced gates:

```yaml
- uses: affaan-m/agentshield@v1
  with:
    path: "."
    min-severity: "medium"
    fail-on-findings: true
```

## Links

- Agent: installed `.opencode/prompts/agents/security-reviewer.txt`
- Optional skill: `security-scan` isn't bundled with this toolkit.
- Scanner: <https://github.com/affaan-m/agentshield>

## Arguments

$ARGUMENTS:
- optional target path
- optional AgentShield flags
