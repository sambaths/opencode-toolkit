# OpenCode Toolkit

Reusable project-local OpenCode V2 agents and commands. Node.js 20+ and npm are
required. OpenCode must already be installed. No provider/model is hard-coded.

## One-command installation

Run from the project where you want to install or update the toolkit:

```sh
npx --yes github:sambaths/opencode-toolkit --project .
```

Installation **replaces matching toolkit files and definitions**, including local
customizations. Previous contents are backed up automatically. Unrelated files
and configuration are retained. No extra overwrite flag or npm publication is
needed. GitHub package installation requires Git and network access.

For reproducible installs, use a release tag or commit rather than the moving
default branch: `npx --yes github:sambaths/opencode-toolkit#COMMIT --project .`
(replace `COMMIT` with a published commit SHA).

Preview without writing:

```sh
npx --yes github:sambaths/opencode-toolkit --project . --dry-run
```

For local/offline source use, install package dependencies first, then run
`node /path/to/toolkit/bin/install.mjs --project /path/to/project`.

## What gets installed

The installer writes `<project>/.opencode/`: 16 custom team roles, 24 retained
ECC agents (including the build override), 23 commands, their prompts, shared
instructions, tests/evaluator, and an ownership manifest. Matching agent/command
definitions in a project-root `opencode.json(c)` are removed to avoid duplicate
definitions; unrelated settings and comments remain intact. It never changes
your project's `AGENTS.md`, global OpenCode configuration, provider settings, or
application files. Plugins, project history, and machine MCP settings are excluded.

Skills, Context7, REA, browser tools, language tooling, and model providers are
optional external dependencies. Agents report missing capabilities rather than
installing them silently. These dependencies may be needed for particular tasks.

## Safety and updates

- Existing JSON/JSONC configuration is merged; unrelated settings and comments
  are retained. An existing default agent is preserved.
- Matching agent/command files and JSON definitions are replaced, whether previously
  installed by this toolkit or not. Legacy singular `agent/` and `command/` files
  with matching IDs are backed up and removed. Unrelated roles/commands remain.
- Shared permission rules replace existing rules with the same action/resource
  matcher. Unrelated permission exceptions are retained after the shared baseline.
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
- The manifest records managed hashes/configuration. Do not edit it to bypass
  ownership tracking. Files retired from a later bundle are not auto-deleted unless
  they conflict with an exported agent/command ID.
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

## Development and verification

```sh
npm ci --ignore-scripts
npm test
npm run validate
node --test bundle/tools/*.test.mjs
npm pack
```

Installer integration tests cover fresh install, dry-run, JSONC, idempotency,
replacement/backups, unrelated-file preservation, and symlink protection. Bundle validation parses YAML,
checks references/routing, and detects duplicated definitions. Model behavior and
real Windows/macOS execution are not established by Linux tests.

Maintainers can re-export the explicit allowlist with
`node scripts/export.mjs /path/to/source/.opencode`; inspect the resulting diff
before committing. See NOTICE.md and LICENSE for upstream attribution.
