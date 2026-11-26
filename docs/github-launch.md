# GitHub launch runbook

This is a checklist and a set of drafts, not authorization to publish. Repository settings, tags, releases, issues, pull requests, and social posts each need separate approval. Don’t commit or push because a checklist has a box.

## 1. Local release check

- [ ] The version is `0.2.0` and the changelog date is `2026-11-25`.
- [ ] `LICENSE`, `NOTICE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `ATTRIBUTION.md`, and `CHANGELOG.md` are present.
- [ ] All docs under `docs/` have valid local links and paths.
- [ ] The README says the compaction, tool-output, and usage-audit defaults accurately.
- [ ] `--no-optimizations`, all individual paired flags, `--adopt-usage-audit`, and `--no-rtk` appear in help and tests, including unmanaged-collision and adoption coverage.
- [ ] RTK rewrite, plugin installation, and `rtk init` remain off.
- [ ] No release copy claims measured token savings, user counts, or benchmark results that weren’t produced.

Run from the repository root:

```sh
npm ci --ignore-scripts
npm test
npm run validate
node --test bundle/tools/*.test.mjs
npm pack --dry-run
```

Then install from the local checkout into a disposable fixture with RTK disabled, inspect the result, and rerun the update path. Test one existing JSONC project too. Record exact commands and failures; a green demo doesn’t erase a red upgrade fixture.

## 2. Repository presentation

**Description**

> Project-local OpenCode agents, commands, and context controls with explicit opt-outs.

**Topics**

`opencode`, `ai-agents`, `llm`, `token-optimization`, `prompt-caching`, `context-compaction`, `developer-tools`, `cli`, `nodejs`

Keep the README install command first. State that this is an independent project, not built by or affiliated with the OpenCode team. Check that the security-reporting link works before telling people to use it.

## 3. v0.2.0 release framing

**Title:** `v0.2.0 — bounded context defaults, explicit opt-outs`

**Release notes draft:**

> This release turns on a small set of OpenCode context defaults: compaction uses the session model, keeps 15,000 recent tokens, starts with a 15% buffer, and doesn’t write speculative background summaries. Tool output is capped at 2,000 lines or 51,200 bytes. The `/usage-audit` command and the read-only `/harness-audit` review cover the surrounding harness.
>
> Native-harness highlight: the toolkit uses OpenCode’s Code Mode/MCP connector plane and structured tool results instead of a custom router. OpenCode natively backgrounds shell commands that hit their timeout; toolkit job list/status/cancel controls are planned, not shipped. It doesn’t create automations, enable warming or `full_codemode`, or promise unattended defaults. The [roadmap](harness-roadmap.md) shows the order and the catches.
>
> Every optimization has an opt-out: `--no-optimizations`, the individual compaction/tool-output/usage-audit pairs, or `--no-rtk` for the managed binary.
>
> The catch: compaction is lossy and output caps can hide detail. Managed RTK is installed by default, but automatic command rewriting stays off. No plugin, `rtk init`, PATH entry, or permission widening is included.
>
> OSS docs now cover contribution, conduct, security, support, configuration, safe RTK evaluation, and release work. Existing unrelated config and comments are retained; matching toolkit files are backed up before replacement.

```sh
npx --yes github:sambaths/opencode-toolkit#v0.2.0 --project .
```

Don’t publish the tag or release until the approval and the final fixture checks are done. If an artifact is attached, publish the digest actually produced by the approved build. Don’t reuse a hash from an older tarball.

## 4. Sixty-second demo

Record the real run. If a step fails, fix it or show the failure; don’t cut around it and call the result verified.

| Time | Shot | Narration |
| --- | --- | --- |
| 0–5s | Clean fixture and terminal | “I don’t want another global agent setup to babysit.” |
| 5–15s | Run the one-command install | “One command writes project-local agents, commands, and instructions. Previous matching files are backed up.” |
| 15–25s | Open the generated config | “Compaction follows the session model, keeps 15k tokens, starts at 85%, and leaves background summaries off.” |
| 25–35s | Run `/plan` on a tiny task | “Planning stays separate from implementation, with a bounded handoff.” |
| 35–45s | Run the usage audit in the terminal, then show the Code Mode catalog | “Native connectors keep tool definitions out of the way. Terminal audit output doesn’t become another model turn.” |
| 45–53s | Show `--no-optimizations --no-rtk --dry-run` | “If you don’t want the defaults, say so before the install.” |
| 53–60s | End card with repo URL | “RTK can be installed without auto-rewrite. Read the catch, then try it.” |

Keep secrets, private paths, and provider billing screens out of the recording.

## 5. Show HN draft

**Title:** Show HN: OpenCode Toolkit – project-local agent workflows with explicit opt-outs

**Body:**

> I built OpenCode Toolkit because copying agent prompts between projects kept turning into config archaeology.
>
> It installs project-local OpenCode roles, commands, shared instructions, and local tools with one command. v0.2.0 adds default-on compaction, tool-output limits, and the `/usage-audit` command. Each has an explicit opt-out.
>
> It also uses native Code Mode/MCP connectors and structured tool results. OpenCode natively backgrounds timed-out shell commands; toolkit job list/status/cancel controls are planned, not shipped. That’s a harness highlight, not an unattended default: no automations are created, and warming and cross-session interruption stay off.
>
> The catch is that compaction is lossy and output limits can hide diagnostics. The managed RTK binary is installed by default, but automatic command rewriting is off; I couldn’t establish that its permission reader preserves this project’s `.opencode` config.
>
> There are no token-savings percentages here. I’m looking for feedback on config merge behavior, the opt-out model, and whether the docs make the permission boundary clear.
>
> `npx --yes github:sambaths/opencode-toolkit --project .`

Post only after approval. Reply with evidence, not adjectives.

## 6. Social drafts

### X

> OpenCode Toolkit 0.2.0: project-local agents, commands, and bounded context defaults. Opt-outs are explicit. Managed RTK installs, but command rewriting stays off. No token-savings fairy tales.
>
> `npx --yes github:sambaths/opencode-toolkit --project .`

Check the final character count with the actual URL added. If it doesn’t fit, cut the joke before you cut the caveat.

### LinkedIn

> I’ve released v0.2.0 of OpenCode Toolkit, a project-local setup for OpenCode agents, commands, shared instructions, and local tools.
>
> The new defaults are concrete: compaction uses the session model, keeps 15,000 recent tokens, starts with a 15% buffer, and disables speculative background summaries. Tool output is capped at 2,000 lines or 51,200 bytes. The `/usage-audit` command and `/harness-audit` help inspect the surrounding harness.
>
> The toolkit also uses native Code Mode/MCP connectors and structured tool results. OpenCode natively backgrounds timed-out shell commands; toolkit job list/status/cancel controls are planned, not shipped. It doesn’t create automations or enable warming and cross-session interruption.
>
> Every default has an opt-out. The managed RTK binary is included, but automatic command rewriting remains off because I can’t establish that its permission reader preserves the project’s `.opencode` configuration.
>
> The catch matters: compaction is lossy, caps can hide detail, and no token-savings percentage is promised. The repo now includes contribution, conduct, security, support, configuration, and evaluation docs.
>
> If you try it, I’d like concrete feedback on config merges and permission boundaries.

### Reddit

**Title:** I made a project-local OpenCode toolkit with explicit context-default opt-outs

> I kept copying agent prompts and commands between projects, so I packaged the setup instead of maintaining another global config.
>
> OpenCode Toolkit installs project-local roles, commands, instructions, and tools. v0.2.0 enables compaction, tool-output caps, and the `/usage-audit` command, with `--no-optimizations` and individual paired flags. It uses native Code Mode/MCP connectors. OpenCode natively backgrounds timed-out shell commands; toolkit job list/status/cancel controls are planned, not shipped. It creates no automations and enables no warming or cross-session interruption. A managed RTK binary is installed by default; automatic rewriting stays off.
>
> The catch: compaction loses detail, output caps can hide errors, and bytes aren’t tokens. There’s no savings percentage or fake benchmark. Existing unrelated config is retained, and matching files are backed up.
>
> Install: `npx --yes github:sambaths/opencode-toolkit --project .`
>
> I’m looking for reproductions of bad upgrades and config conflicts, not launch-day applause.

Read the subreddit’s self-promotion rules first. Post in a relevant community only after approval.

### Discord

> I shipped OpenCode Toolkit 0.2.0: project-local OpenCode roles, commands, and context defaults with explicit opt-outs. Compaction keeps 15k tokens with a 15% buffer; tool output caps at 2,000 lines/51,200 bytes. Managed RTK installs, but auto-rewrite stays off. The catch is lossy compaction and hidden diagnostics, so the config and evaluation docs spell out the tradeoffs. Repo: https://github.com/sambaths/opencode-toolkit

Ask a channel moderator before posting. No mass DMs.

## 7. Ecosystem submissions

These are external submissions, not release steps. Draft them locally, then wait for separate approval to fork, push, or submit. Prioritize awesome-opencode when the repo meets its eligibility rules, [opencode.cafe](https://opencode.cafe/), and relevant community channels. The official ecosystem listing needs confirmation first.

### opencode.cafe

Review the [submission guidelines](https://opencode.cafe/guidelines), then use the [submission form](https://opencode.cafe/submit) after approval. Describe the toolkit as an OpenCode V2 project, include the public repo and setup command, and state that it’s community-built and not affiliated with OpenCode. Don’t claim the marketplace endorses it.

### Official OpenCode ecosystem: confirmation required

As checked on 2026-11-25, the official [ecosystem page](https://opencode.ai/v1/docs/ecosystem/) is explicitly a V1 surface and a V2 listing location is unconfirmed. Don’t open a PR against a guessed path or an old V1 table.

1. Ask an OpenCode maintainer to confirm the current V2 listing surface, accepted category, target branch, and whether a docs-only PR is welcome.
2. Pass the version gate: the toolkit targets OpenCode V2. If the maintainer confirms only a V1 list, skip the submission rather than implying V1 support.
3. Recheck the [official contributing guide](https://github.com/anomalyco/opencode/blob/dev/CONTRIBUTING.md) and the confirmed page.
4. Only after confirmation, fork the repository and add the requested entry. Proposed description: “Project-local agents, commands, context defaults, and explicit opt-outs for OpenCode V2.”
5. Run that checkout’s docs build and link checks. Report exact commands and limits.
6. Use a focused title such as `docs(ecosystem): add OpenCode Toolkit`. Link an approved feature issue if the maintainers ask for one.

If no V2 surface is confirmed, use the community listings and channels above. An ecosystem listing isn’t endorsement; don’t call the project official.

### awesome-opencode

The [current contribution guide](https://github.com/awesome-opencode/awesome-opencode/blob/main/contributing.md) requires one YAML file under `data/projects/`; don’t edit the generated README. As checked on 2026-11-25, it also requires a public maintained repo at least 30 days old, a commit within 90 days, and at least 25 stars. Recheck those rules before submitting.

Create `data/projects/opencode-toolkit.yaml` in your fork:

```yaml
name: OpenCode Toolkit
repo: https://github.com/sambaths/opencode-toolkit
tagline: Project-local OpenCode agents, commands, and context controls with explicit opt-outs.
description: Installs OpenCode V2 roles, commands, shared instructions, local context tools, and default compaction/tool-output settings. Includes paired opt-outs and a managed RTK binary with automatic rewriting disabled.
```

In that checkout, run:

```sh
npm ci
npm run validate
```

Open one focused PR after approval. If the repo doesn’t meet the eligibility rules yet, wait. Don’t trade stars, coordinate fake ones, or inflate activity to qualify.

## 8. Good first issues

These are ideas, not claims that issues already exist. File only the ones the maintainer approves.

- **Docs link check:** add a small script that verifies local Markdown links and heading anchors without fetching external pages.
- **Opt-out matrix:** add installer fixtures for every individual paired flag and the group opt-out.
- **Root conflict example:** add a sanitized JSONC fixture showing a root optimization setting retained and reported instead of shadowed by a local default.
- **RTK status capture:** add a PowerShell version of the raw-versus-filtered protocol, including immediate exit-status capture.
- **Help snapshot:** test that install, dry-run, model, optimization, and RTK flags all appear in CLI help.
- **Backup manifest check:** add a fixture proving unrelated files stay untouched while a matching file is backed up before replacement.

A good issue states the problem, expected result, likely files, and verification command. “Improve docs” is a haunting, not an issue.

## 9. Launch conduct

- Don’t buy stars, traffic, followers, or reviews.
- Don’t invent users, benchmark scores, token savings, or provider support.
- Don’t ask for stars as a condition of help, and don’t brigade issues.
- Report real counts only when you can name the source and time window.
- Correct wrong claims in the release and posts. A quiet correction beats a permanent footnote.

## Sources

- GitHub Docs: [README files and relative links](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes), [repository topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics), [healthy community files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions), [contribution guidelines](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors), and [release management](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).
- OpenCode: [official repository](https://github.com/anomalyco/opencode) and [contributing guide](https://github.com/anomalyco/opencode/blob/dev/CONTRIBUTING.md). Recheck the current ecosystem location before drafting a PR.
- Community listings: [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode) and its [contribution guide](https://github.com/awesome-opencode/awesome-opencode/blob/main/contributing.md); [opencode.cafe](https://opencode.cafe/) and its [submission guidelines](https://opencode.cafe/guidelines).
- [ATTRIBUTION.md](../ATTRIBUTION.md) for the full source and license record.

External guides inform the checklist. They don’t grant permission to change settings or post.
