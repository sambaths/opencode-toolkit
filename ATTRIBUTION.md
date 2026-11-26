# Attribution

This toolkit stands on other people’s work. I’m grateful for the maintainers who published source, docs, and research instead of making the rest of us guess.

Attribution here isn’t endorsement. Those projects don’t maintain or certify OpenCode Toolkit. The detailed shipped-content record is [NOTICE.md](NOTICE.md); the toolkit’s own license is [LICENSE](LICENSE).

## Everything Claude Code

[Everything Claude Code](https://github.com/affaan-m/ECC) by Affaan Mustafa supplied retained agent prompts, command templates, and the skill evidence evaluator. I adapted that material for project-local OpenCode V2 file-backed agents, commands, model tiers, permission boundaries, and plan-first handoffs. The changes are ours; the upstream project doesn’t review them.

- Upstream source: [affaan-m/ECC](https://github.com/affaan-m/ECC)
- Upstream license: [MIT](https://github.com/affaan-m/ECC/blob/main/LICENSE)
- Retained material: [agent prompts](bundle/prompts/agents/), [command templates](bundle/commands/), and the [skill evaluator](bundle/tools/evaluate-skill.mjs)
- Shipped provenance and known source limits: [NOTICE.md](NOTICE.md)
- Combined notice: [LICENSE](LICENSE)

Some upstream files came from machine-local ignored paths, so there isn’t a precise upstream commit for every retained file. NOTICE.md says that plainly rather than inventing one.

## Matt Pocock’s skills

Six skills were adapted from [Matt Pocock’s skills repository](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823), pinned at commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823`:

- `toolkit-grilling`
- `toolkit-handoff`
- `toolkit-questionnaire`
- `toolkit-diagnosing-bugs`
- `toolkit-tdd`
- `toolkit-retro`

I changed coordination and consent guidance for this toolkit, inlined useful testing/mocking guidance, and omitted the upstream human-in-the-loop script. These remain local text, not a runtime dependency or an auto-updater.

- Exact source mapping: [bundle/skills/provenance.json](bundle/skills/provenance.json)
- Preserved upstream MIT notice: [bundle/skills/LICENSE.mattpocock.txt](bundle/skills/LICENSE.mattpocock.txt)
- Upstream license at the pinned commit: [MIT](https://github.com/mattpocock/skills/blob/abeeaf95660ba9e8b7c753eb38f441ca707a8823/LICENSE)

## RTK OSS

The installer can provision the managed [RTK](https://github.com/rtk-ai/rtk) OSS v1.2.1 binary. It uses the separately published `rtk-oss-*` assets from [release v1.2.1](https://github.com/rtk-ai/rtk/releases/tag/v1.2.1), whose source commit is `d0f0399a5ff8cd1d81325a033f0b2d8864d665f6`.

No RTK source is vendored here. The installed binary keeps its upstream [Apache-2.0 license](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/LICENSE) and metadata. The installer verifies the pinned archive but never executes it. Automatic rewriting, `rtk init`, and the RTK plugin remain off because I couldn’t establish that the adapter’s permission reader preserves this toolkit’s `.opencode` configuration.

- Repository: [rtk-ai/rtk](https://github.com/rtk-ai/rtk)
- Managed release and assets: [v1.2.1](https://github.com/rtk-ai/rtk/releases/tag/v1.2.1)
- Pinned source license: [Apache-2.0](https://github.com/rtk-ai/rtk/blob/d0f0399a5ff8cd1d81325a033f0b2d8864d665f6/LICENSE)
- Installer provenance and limits: [bundle/tools/rtk-install.md](bundle/tools/rtk-install.md)

## OpenCode V2 docs and API

The [OpenCode configuration docs](https://opencode.ai/docs/config), [model docs](https://opencode.ai/docs/models), [compaction docs](https://opencode.ai/docs/compaction), [MCP docs](https://opencode.ai/docs/mcp-servers), and [API reference](https://opencode.ai/docs/api) informed the configuration fields, model-tier rendering, usage-audit boundaries, and permission cautions in this release. The official [changelog](https://opencode.ai/changelog), especially [v2.3.1](https://opencode.ai/changelog/v2.3.1) through [v2.4.1](https://opencode.ai/changelog/v2.4.1), informed the [native-harness roadmap](docs/harness-roadmap.md).

I used the documented interfaces; I didn’t copy the OpenCode runtime. Experimental API routes and upstream defaults can change, so the toolkit’s tests don’t claim live provider or API verification. OpenCode is an independent project and does not endorse this toolkit.

## Long-horizon research

The [long-horizon roadmap](docs/long-horizon.md) draws on the [OpenCode V2 client contract](https://opencode.ai/docs/build/client), [SDK lifecycle](https://opencode.ai/docs/build/sdk), [session/job/inbox/worktree API](https://opencode.ai/docs/api), [compaction limits](https://opencode.ai/docs/compaction), [tools and subagents](https://opencode.ai/docs/tools), the native [`/goal` changelog in v2.2.1](https://opencode.ai/changelog/v2.2.1), and the [v2.4.0 automations changelog](https://opencode.ai/changelog/v2.4.0).

William Ricchiuti’s [OpenCode goal plugin](https://github.com/william-ricchiuti/OpenCode-goal-plugin) and its [changelog](https://github.com/william-ricchiuti/OpenCode-goal-plugin/blob/main/CHANGELOG.md) informed the research on leases, paused recovery, checkpointing, evidence-gated completion, and independent verification. The plugin is [MIT-licensed](https://github.com/william-ricchiuti/OpenCode-goal-plugin/blob/main/LICENSE), but it isn’t bundled or installed here. Native `/goal` exists; the plugin is in maintenance mode, and this roadmap doesn’t claim shipped unattended execution.

## Token-optimization research

[awesome-llm-token-optimization](https://github.com/pleasedodisturb/awesome-llm-token-optimization) was research inspiration for this release: prompt caching, context management, tool-output pressure, and the difference between bytes, tokens, and billed cost.

I didn’t copy its list or inherit its benchmarks. Its [CC BY 4.0 license](https://github.com/pleasedodisturb/awesome-llm-token-optimization/blob/main/LICENSE) applies to that repository’s material. Any savings claim still needs evidence from the actual workload, route, and time window.

## Contributor Covenant

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) adapts [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/), with this project’s reporting address filled in. The Covenant’s enforcement ladder also credits Mozilla’s code of conduct.

## GitHub Docs

GitHub’s docs informed the community files, security-reporting route, README/presentation checklist, release notes, and ecosystem submission steps. Useful primary pages:

- [About the repository README file](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [Setting up your project for healthy contributions](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions)
- [Repository security advisories](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/repository-security-advisories)
- [Adding a security policy to a repository](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository)
- [Managing releases in a repository](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

No GitHub Docs text is reproduced here. GitHub doesn’t review or approve this launch plan.

## Evaluated but not bundled

[Skill candidates](docs/skill-candidates.md) and the proposed [domain-learning onramp](docs/domain-learning.md) record research and recommendations only. No candidate from those pages is bundled or adopted, and adoption needs separate approval.

- **Matt Pocock:** evaluated `writing-for-agents`, `codebase-design`, `research`, `domain-modeling`, `teach`, `coding-standards`, `diagnosing-bugs`, and `tdd` at pinned commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823`. Source: [mattpocock/skills](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823); license: [MIT](https://github.com/mattpocock/skills/blob/abeeaf95660ba9e8b7c753eb38f441ca707a8823/LICENSE). The six already-shipped adaptations are credited above; the rest remain evaluations.
- **Everything Claude Code:** evaluated `github-ops`, `verification-loop`, `terminal-ops`, `code-review`, `security-review`, `agent-harness-construction`, `coding-standards`, `iterative-retrieval`, `deep-research`, `search-first`, and `code-tour` at commit `4adeee6732a12d1540f49a4d50a38ce8c97f9a53`. Source: [ECC](https://github.com/affaan-m/ECC/tree/4adeee6732a12d1540f49a4d50a38ce8c97f9a53); license: [MIT](https://github.com/affaan-m/ECC/blob/4adeee6732a12d1540f49a4d50a38ce8c97f9a53/LICENSE).
- **OpenCode:** evaluated the native skill-loading and documentation-index surfaces at commit `b6973f1b7b98e3db575bdb4ecbba6884e6eef8c2`. Sources: [skill tool](https://github.com/anomalyco/opencode/blob/b6973f1b7b98e3db575bdb4ecbba6884e6eef8c2/packages/core/src/tool/plugin/skill.ts) and [built-in OpenCode skill](https://github.com/anomalyco/opencode/blob/b6973f1b7b98e3db575bdb4ecbba6884e6eef8c2/packages/core/src/plugin/skill/opencode.md); license: [MIT](https://github.com/anomalyco/opencode/blob/b6973f1b7b98e3db575bdb4ecbba6884e6eef8c2/LICENSE).
- **Architecture decisions:** Michael Nygard’s [Documenting Architecture Decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) (2011) is waived under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Minimal reproducible examples:** the [Stack Overflow MRE guidance](https://stackoverflow.com/help/minimal-reproducible-example) informed O4. See [Stack Overflow licensing by contribution revision](https://stackoverflow.com/help/licensing); no article text is copied here.
- **Learning research:** Henry Roediger and Jeffrey Karpicke’s [Test-Enhanced Learning](https://doi.org/10.1111/j.1467-9280.2006.01693.x) (2006), Michelene Chi and colleagues’ [Self-Explanations](https://education.asu.edu/lcl/publications/chi-m-t-h-bassok-m-lewis-m-reimann-p-glaser-r-1989-self-explanations-how-students) (1989; [DOI](https://doi.org/10.1016/0364-0213(89)90002-5)), and Chi’s [Self-Explaining Expository Texts](https://education.asu.edu/lcl/publications/chi-m-t-h-2000-self-explaining-expository-texts-dual-processes-generating-0) (2000) inform the teach-back rationale. No open reuse license is asserted for those papers; no paper text is copied.
- **Walking skeleton:** Alistair Cockburn’s concept is credited through the [C2 primary-discussion quotation](https://wiki.c2.com/?WalkingSkeleton). No open reuse license is asserted, and no standalone skill is proposed.

## Corrections

If a credit is wrong or incomplete, open an issue with the source and the affected file. I’d rather fix the record than defend a tidy mistake.
