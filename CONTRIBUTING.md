# Contributing

A portable toolkit needs boring, reviewable changes. I’d rather have one small fix with evidence than a large rewrite with a promise.

## Before you start

- Read [README.md](README.md), [NOTICE.md](NOTICE.md), [ATTRIBUTION.md](ATTRIBUTION.md), and the relevant files under `bundle/`.
- Check existing issues and pull requests. If there isn’t an issue for a behavior change, open one first so we can settle scope.
- Reproduce the problem before changing code. Say what you expected and what happened.
- Keep unrelated work out of the branch. Don’t reformat the world because your editor felt creative.

For substantive work, start with a short plan: goal, scope and non-goals, affected files, ordered steps, acceptance criteria, checks, risks, and a repair limit. Follow the project’s plan-first handoff rules. If a delegated task arrives without enough plan context, send it back rather than inventing a new one.

## Local setup

You need Node.js 20+, npm, and Git. OpenCode itself is optional for unit tests; install it separately if you want a live smoke test.

```sh
git clone https://github.com/sambaths/opencode-toolkit.git
cd opencode-toolkit
npm ci --ignore-scripts
```

`npm ci` keeps dependency installs tied to `package-lock.json`. `--ignore-scripts` avoids running dependency lifecycle scripts during setup.

## Verify a change

Run focused tests first, then the full set before you hand work over:

```sh
npm test
npm run validate
node --test bundle/tools/*.test.mjs
npm pack --dry-run
```

- `npm test` runs the installer and RTK unit/integration tests.
- `npm run validate` parses bundle YAML, checks references and routing, and rejects duplicate definitions.
- `node --test bundle/tools/*.test.mjs` runs the shipped tool and prompt-contract tests.
- `npm pack --dry-run` checks the published file list without leaving a tarball behind.

For a behavior change, add a regression test at the existing seam. For installer changes, test both a fresh fixture and an update fixture. JSONC comments, unrelated settings, backups, permission order, and root/local conflicts are part of the behavior, not decoration.

Linux tests don’t prove live model behavior, provider availability, or Windows/macOS execution. Report those gaps instead of rounding them up to “works everywhere.”

## Add a role

1. Create `bundle/agents/<role-id>.md` with YAML frontmatter and the role prompt in the body. Use a portable lowercase, hyphenated ID.
2. Set `description`, `mode`, and only the permissions the role needs. Specialists are leaves; don’t grant them nested delegation.
3. Add the role to `ROLE_TIERS` in `lib/model-profile.mjs`. Review and coordination work uses `thinking`; implementation work uses `coding`.
4. Keep model selectors out of bundle templates. The installer renders the selected model into installed definitions.
5. For a retained JSON-backed agent, add its prompt under `bundle/prompts/agents/` and reference it with `{file:...}` in `bundle/opencode.json`. It still needs an explicit tier.

Give the role a clear stop condition and report format. “Help with code” is a wish, not a job description.

## Add a command

Create `bundle/commands/<command-id>.md`:

```md
---
description: Say exactly when this command is useful
agent: manager
subagent: false
---

Do the bounded task for: $ARGUMENTS
```

Use `subagent: false` when the command belongs in the current top-level session. Validate the target agent, keep prompts scoped, and add the command ID to the explicit allowlist in `scripts/export.mjs` so re-exports retain it.

A command is instructions, not a runtime gate. If it claims a check ran, it needs evidence from an actual invocation.

## Add a local tool

Put the script, guide, and tests together under `bundle/tools/`:

```text
bundle/tools/example.mjs
bundle/tools/example.test.mjs
bundle/tools/example.md
```

The installer copies allowlisted bundle content recursively. Keep paths project-relative, use Node’s built-in modules where practical, and test installed-path execution as well as direct execution. Refuse unsafe paths and sensitive roots. Bound output, preserve exit status, and state what the tool does not inspect.

Don’t add machine-specific MCP settings, plugins, credentials, telemetry, or a new dependency just to make one helper work. Discuss that tradeoff first.

## Write docs in this voice

- Lead with the reader’s problem, not the feature’s greatness.
- Use first person where ownership matters: “I don’t promise savings” beats “we are committed to excellence.”
- Keep paragraphs short. Prefer plain words, contractions, commands, and exact numbers.
- State the catch next to the claim. A dry joke is fine; a victory lap isn’t.
- No hype, corporate jargon, emoji decoration, fake curiosity, or generic AI throat-clearing.
- Verify every local path and command. Don’t turn an untested runtime assumption into a fact.
- Keep this documentation set scannable. Link to detail instead of copying it into four files.

## Pull request checklist

- [ ] The change is focused and follows the agreed plan and scope.
- [ ] I added or updated a regression test at an existing seam for changed behavior.
- [ ] `npm test` passed, or I reported the exact failure.
- [ ] `npm run validate` passed, or I reported the exact failure.
- [ ] `node --test bundle/tools/*.test.mjs` passed, or I reported the exact failure.
- [ ] `npm pack --dry-run` shows the intended published files.
- [ ] Local links, paths, commands, and version/date claims are checked.
- [ ] I included no secrets, environment files, backups, or private transcripts.
- [ ] The PR explains the problem, change, evidence, and remaining gaps briefly.
- [ ] I have not committed, pushed, opened a pull request, or published a release without an explicit request.
