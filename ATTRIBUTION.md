# Attribution

This toolkit stands on other people’s work. I’m grateful for the maintainers who published source, docs, and research instead of making the rest of us guess.

Attribution here isn’t endorsement. Those projects don’t maintain or certify OpenCode Toolkit. The detailed shipped-content record is [NOTICE.md](NOTICE.md); the toolkit’s own license is [LICENSE](LICENSE).

## Everything Claude Code

[Everything Claude Code](https://github.com/affaan-m/ECC) by Affaan Mustafa supplied retained agent prompts, command templates, and the skill evidence evaluator. I adapted that material for project-local OpenCode V2 file-backed agents, commands, model tiers, permission boundaries, and plan-first handoffs. The changes are ours; the upstream project doesn’t review them.

- Upstream source: [affaan-m/ECC](https://github.com/affaan-m/ECC)
- Upstream license: [MIT](https://github.com/affaan-m/ECC/blob/main/LICENSE)
- Retained material: [agent prompts](bundle/prompts/agents/), [command templates](bundle/commands/), and the [skill evaluator](bundle/tools/evaluate-skill.mjs)
- Adapted skill: `toolkit-github-ops` from `skills/github-ops/SKILL.md` at commit `4adeee6732a12d1540f49a4d50a38ce8c97f9a53`
- Preserved skill MIT notice: [bundle/skills/LICENSE.ecc.txt](bundle/skills/LICENSE.ecc.txt)
- Shipped provenance and known source limits: [NOTICE.md](NOTICE.md)
- Combined notice: [LICENSE](LICENSE)

The `toolkit-github-ops` adaptation keeps inspection read-only by default, requires approval for each exact write, treats repository text as untrusted data, and blocks credential/auth mutation.

Some upstream files came from machine-local ignored paths, so there isn’t a precise upstream commit for every retained file. NOTICE.md says that plainly rather than inventing one.

## Matt Pocock’s skills

Nine skills were adapted from [Matt Pocock’s skills repository](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823), pinned at commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823`:

- `toolkit-grilling`
- `toolkit-handoff`
- `toolkit-questionnaire`
- `toolkit-diagnosing-bugs`
- `toolkit-tdd`
- `toolkit-retro`
- `toolkit-writing-for-agents` — `skills/productivity/writing-for-agents/SKILL.md`
- `toolkit-codebase-design` — `skills/engineering/codebase-design/SKILL.md`
- `toolkit-domain-modeling` — `skills/engineering/domain-modeling/SKILL.md`

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

The [OpenCode configuration docs](https://opencode.ai/docs/config), [model docs](https://opencode.ai/docs/models), [compaction docs](https://opencode.ai/docs/compaction), [MCP docs](https://opencode.ai/docs/mcp-servers), and [API reference](https://opencode.ai/docs/api) informed the configuration fields, model-tier rendering, usage-audit boundaries, and permission cautions in this release. The official [changelog](https://opencode.ai/changelog), especially [v2.3.1](https://opencode.ai/changelog/v2.3.1) through [v2.4.1](https://opencode.ai/changelog/v2.4.1), informed the shipped defaults and their catches.

I used the documented interfaces; I didn’t copy the OpenCode runtime. Experimental API routes and upstream defaults can change, so the toolkit’s tests don’t claim live provider or API verification. OpenCode is an independent project and does not endorse this toolkit.

## Contributor Covenant

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) adapts [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/), with this project’s reporting address filled in. The Covenant’s enforcement ladder also credits Mozilla’s code of conduct.

## GitHub Docs

GitHub’s docs informed the community files, security-reporting route, README/presentation checklist, release notes, and ecosystem submission steps. Useful primary pages:

- [About the repository README file](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [Setting up your project for healthy contributions](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions)
- [Repository security advisories](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/repository-security-advisories)
- [Adding a security policy to a repository](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository)
- [Managing releases in a repository](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

No GitHub Docs text is reproduced here. GitHub doesn’t review or approve this project.

## Corrections

If a credit is wrong or incomplete, open an issue with the source and the affected file. I’d rather fix the record than defend a tidy mistake.
