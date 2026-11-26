# Configuration

The defaults are opinionated so a fresh install behaves sensibly. They’re also replaceable. Read the catch before you point a long-running session at them.

## Install

Node.js 20+, npm, Git, and an existing OpenCode installation are required. GitHub package installation and the default RTK download need network access.

```sh
npx --yes github:sambaths/opencode-toolkit --project .
```

For a reproducible install, pin a release tag or commit:

```sh
npx --yes github:sambaths/opencode-toolkit#v0.2.0 --project .
```

Preview without toolkit or RTK writes:

```sh
npx --yes github:sambaths/opencode-toolkit --project . --dry-run
```

The surrounding `npx` package fetch is outside that no-write guarantee.

## Default-on optimizations

On a fresh install without root-config conflicts, the installer writes these settings to `.opencode/opencode.json` or the existing `.opencode/opencode.jsonc`:

| Setting | Default | Catch |
| --- | --- | --- |
| Compaction model | Current session model | The toolkit doesn’t force a coding-tier summary model or write `agents.compaction.model`. Switching the session model changes the summarizer. |
| `compaction.auto` | `true` | Compaction is lossy. It can recover once from a context-length rejection, not fix oversized fixed instructions. |
| `compaction.keep.tokens` | `15000` | More retained detail leaves less room for new work. |
| `compaction.buffer` | `"15%"` | Automatic compaction starts at about 85% of the usable context window. |
| `compaction.background` | `false` | No speculative summary work, but a due summary can pause the session while it’s written. |
| `tool_output.max_lines` | `2000` | Large output is shortened for the model. Full-output recovery is tool-dependent; don’t assume every tool leaves a readable file. |
| `tool_output.max_bytes` | `51200` | The byte cap can hide the diagnostic you needed. Scope the command instead of raising every limit blindly. |

The rendered shape looks like this:

```jsonc
{
  "compaction": {
    "auto": true,
    "keep": { "tokens": 15000 },
    "buffer": "15%",
    "background": false
  },
  "tool_output": {
    "max_lines": 2000,
    "max_bytes": 51200
  }
}
```

Model flags select the toolkit’s role models; they don’t pin the compaction model. Omitting both model flags retains the saved pair. The installer doesn’t validate model availability, and it configures no automatic failover. If you explicitly set `agents.compaction.model` and that model cannot resolve, OpenCode falls back to the session model. The toolkit default is the session model itself, not a fallback. See [model profiles](../README.md#model-profiles) and [OpenCode compaction](https://opencode.ai/docs/compaction#model).

### Usage audit

The usage audit is on by default. A fresh install includes `/usage-audit`, `.opencode/tools/usage-audit.mjs`, its guide, and its tests. It queries the OpenCode API for recorded token, cost, model, and tool-usage statistics over a bounded window. It doesn’t render prompt/activity content or write project files.

If a fresh install finds pre-existing unmanaged usage-audit artifacts, it stops before writes. Review those files, then move/remove them or rerun with `--adopt-usage-audit` to explicitly take ownership with the normal backup behavior.

The CLI may start the backend service if it isn’t running, and it uses the configured remote server when one is configured. This isn’t a guaranteed local-only operation.

Run a seven-day Markdown report directly in your terminal:

```sh
node .opencode/tools/usage-audit.mjs --root . --days 7 \
  --format markdown --tools summary --timezone UTC
```

Terminal use keeps the report out of another model turn. If an agent runs `/usage-audit`, the aggregate usage metadata becomes part of that agent run and enters the current model/provider context. It still doesn’t include prompt/activity text, but it isn’t a privacy-free shell command.

The API route is experimental, and recorded cost isn’t an independent provider-billing audit. Missing CLI/API data and truncated reports fail or report their limits instead of inventing numbers. Use `/harness-audit` for the broader static review of settings, role/tool use, dependencies, and permission boundaries.

For a separate prompt-source footprint report:

```sh
node .opencode/tools/context-tools.mjs audit --root .opencode
```

That reports UTF-8 source bytes for toolkit-known prompt files, not tokens, live request size, model cost, or every file under `.opencode`. Read [the tool guide](../bundle/tools/context-tools.md) for its exclusions and truncation flags.

`--no-usage-audit` removes the unmodified managed audit command, tool, guide, and tests. A customized file is preserved and becomes unmanaged rather than being deleted. A later `--usage-audit` then fails before writes on the unmanaged collision. After review, move/remove the customized file or explicitly pass `--adopt-usage-audit` to take ownership with the normal backup behavior.

## Opt out

Turn off all three toolkit-managed optimization defaults:

```sh
npx --yes github:sambaths/opencode-toolkit --project . --no-optimizations
```

Or select them with paired flags:

| Control | On | Off |
| --- | --- | --- |
| Compaction defaults | `--compaction` | `--no-compaction` |
| Tool-output defaults | `--tool-output` | `--no-tool-output` |
| Usage audit | `--usage-audit` | `--no-usage-audit` |

For example, keep usage auditing but disable the other defaults:

```sh
npx --yes github:sambaths/opencode-toolkit --project . \
  --no-compaction --no-tool-output --usage-audit
```

Use one flag from each relevant pair, then check `--dry-run` for the planned changes. Passing both members of a pair, such as `--compaction --no-compaction`, is rejected before writes. Omitted flags retain the profile choices saved by an earlier install; a fresh install starts with all three enabled. Positive flags re-enable a disabled profile. If you mix `--no-optimizations` with paired flags, the group flag sets the baseline and explicit paired flags select the exceptions, regardless of argument order.

`--no-optimizations` is a group opt-out, not a claim that manual compaction or your own OpenCode settings stop existing.

To keep custom values across updates, put them in the project-root config as described below. Don’t hand-edit a generated local profile and then expect an opt-out to remove it: if the installer detects that customization, it stops before writes for manual review. Don’t edit `.opencode/toolkit-manifest.json` to bypass ownership tracking. Re-running an install replaces matching toolkit files, including local edits to managed files; previous contents are backed up.

## RTK is separate

The same install command provisions managed RTK OSS v1.2.1 at `.opencode/vendor/rtk/` by default. The installer verifies the pinned archive, preserves its license and metadata, and never executes the binary.

- No PATH entry, plugin, hook, `rtk init`, permission change, or automatic command rewriting is installed.
- Availability is not integration. A manual invocation still needs explicit authorization.
- `--no-rtk` skips all RTK download/write work and leaves an existing managed install untouched.
- `--no-optimizations` does not skip RTK. Use both flags if you want neither.
- Supported targets, checksums, and failure behavior live in [the RTK install guide](../bundle/tools/rtk-install.md).

Rewrite integration stays off. A wrapped command is a different permission resource from the bare command; don’t use a wrapper to slip past an approval prompt. Inspect the pinned artifact through [the RTK install guide](../bundle/tools/rtk-install.md).

## Optional autonomy

Native OpenCode can do more than this toolkit enables. Treat extra autonomy as a separate decision:

- **Automations:** the toolkit creates none. They’re off unless you explicitly create one; set `"automations": false` if you want the native feature disabled. A shell automation asks at creation, so don’t point a recurring job at a write or deploy command casually.
- **Warming:** off. It sends real billable requests; the toolkit doesn’t enable it.
- **`experimental.full_codemode`:** off. It can expose session interruption for other sessions, background jobs, and subagents. That’s too much authority for a default.
- **Plugins:** the toolkit installs none. If you add one, pin an exact version or commit. Avoid `@latest`, ranges, and Git branches; OpenCode checks those floating specs at startup and every 24 hours, then installs and reloads newer matches.
- **MCP:** the toolkit configures no servers. When you add one, set `protocol` explicitly per server: `"legacy"` for a known legacy server or `"2026-07-28"` for a known current one. Use `"auto"` only when you intend protocol probing and can handle the extra startup process.

## User configuration and root conflicts

The installer merges JSON/JSONC, retains unrelated settings and comments, and preserves an existing `default_agent`. It doesn’t change provider credentials, global OpenCode configuration, `AGENTS.md`, or application source. Matching agent/command definitions are managed by the toolkit; collisions in project-root config are removed after backup.

Existing user-managed local optimization settings are preserved, and the installer reports that it didn’t apply the matching defaults. Settings recorded as toolkit-generated are refreshed on update. If you change a generated value, the installer preserves your customization and reports it; opting out then requires manual review.

A format-1 manifest migrates to format 2 with all three profiles enabled by default. Existing customization is still protected: migration records ownership only for values the toolkit actually generated and doesn’t overwrite user-managed settings.

The catch is config precedence. OpenCode merges direct `opencode.json(c)` files first, then `.opencode/opencode.json(c)` files. If both set the same key, the local file wins.

The installer avoids silently shadowing your root choices with feature-level suppression. A root `compaction` block suppresses toolkit management of the whole local compaction profile; a root `tool_output` block does the same for local output settings. The installer removes a matching generated local profile, preserves a non-empty user-managed local value, reports the conflict, and leaves the root file unchanged. It doesn’t merge toolkit defaults into those root features leaf by leaf.

Preserved non-empty user-managed `.opencode` values retain precedence over root config. When generated local values are removed or suppressed, root config controls. A user-managed absence survives a temporary root conflict and stays absent after the root feature or file is removed; the installer doesn’t restore defaults over that choice. Read the install output; a successful exit doesn’t mean the defaults were written.

Prefer one config location for a setting. Put intentional custom optimization values in project-root config rather than editing generated local fields. Unrelated root settings stay intact.

Ancestor, global, and managed settings can still affect the result. Ordered permission rules are merged conservatively, but static checks don’t prove the final runtime policy. Review inherited settings and existing plugins before calling an install safe.

## Recovery

Before replacing or removing a file, the installer saves it under `.opencode/.toolkit-backups/<install-id>/`. The printed `backup-manifest.json` lists the saved paths. Backups may contain private configuration; don’t force-add or publish them.

A dry run lists paths, not a line-level diff. The whole install isn’t a filesystem transaction: an I/O failure can leave partial output. Fix the cause and rerun rather than hand-editing the manifest.

## Sources

- OpenCode V2: [configuration and precedence](https://opencode.ai/docs/config), [model selection and caching](https://opencode.ai/docs/models), [compaction behavior and limits](https://opencode.ai/docs/compaction), [tools and Code Mode](https://opencode.ai/docs/tools), [MCP context and permissions](https://opencode.ai/docs/mcp-servers), [plugins and update behavior](https://opencode.ai/docs/plugins), [warming](https://opencode.ai/docs/warming), the [API reference](https://opencode.ai/docs/api), and the [v2.3.1–v2.4.1 changelog](https://opencode.ai/changelog).
- [ATTRIBUTION.md](../ATTRIBUTION.md) for the full source and license record.

These docs define upstream behavior; the toolkit defaults and opt-outs are this project’s choices.
