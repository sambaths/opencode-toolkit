# OpenCode toolkit (working name)

Reusable project-local OpenCode V2 agents and commands. Node.js 20+ and npm are
required. OpenCode must already be installed. No provider/model is hard-coded.

## One-command installation

After the repository name is confirmed and pushed, run from your project:

```sh
npx --yes github:OWNER/REPO --project .
```

`OWNER/REPO` is a placeholder until publication. This does not require npm
publication. GitHub package installation also requires Git and access to the
repository; private repositories need appropriate Git authentication.

For reproducible installs, use a release tag or commit rather than the moving
default branch: `npx --yes github:OWNER/REPO#v0.1.0 --project .`.

Preview without writing:

```sh
npx --yes github:OWNER/REPO --project . --dry-run
```

For local/offline source use, install package dependencies first, then run
`node /path/to/toolkit/bin/install.mjs --project /path/to/project`.

## What gets installed

The installer writes only `<project>/.opencode/`: 16 custom team roles, 24 retained
ECC agents (including the build override), 23 commands, their prompts, shared
instructions, tests/evaluator, and an ownership manifest. It never writes your
project's `AGENTS.md`, global OpenCode configuration, provider credentials, or
application files. Plugins, project history, and machine MCP settings are excluded.

Skills, Context7, REA, browser tools, language tooling, and model providers are
optional external dependencies. Agents report missing capabilities rather than
installing them silently. These dependencies may be needed for particular tasks.

## Safety and updates

- Existing JSON/JSONC configuration is merged; unrelated settings and comments
  are retained. An existing default agent is preserved.
- Existing agent/command file conflicts and contradictory permissions stop the
  install before writes. There is deliberately no `--force` option.
- Re-run the install command to update unchanged managed files. Customized files
  are preserved by refusing conflicting updates; resolve them manually first.
- Dry-run lists planned paths and validates conflicts, but is not a line-level diff.
- The manifest records managed hashes/configuration. Do not edit it to bypass
  conflict detection. Files removed from a later bundle are not auto-deleted.
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
conflict preservation, and symlink protection. Bundle validation parses YAML,
checks references/routing, and detects duplicated definitions. Model behavior and
real Windows/macOS execution are not established by Linux tests.

Maintainers can re-export the explicit allowlist with
`node scripts/export.mjs /path/to/source/.opencode`; inspect the resulting diff
before committing. See NOTICE.md and LICENSE for upstream attribution.
