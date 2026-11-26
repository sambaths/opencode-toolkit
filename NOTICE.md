# Provenance

This toolkit didn't come from nowhere. [ATTRIBUTION.md](ATTRIBUTION.md) maps each
borrowed piece to its source, commit, and license. This file keeps the important
notices together.

## Retained ECC material

Retained agent prompts, command templates, and the skill evidence evaluator come
from [Everything Claude Code](https://github.com/affaan-m/ECC) (MIT, copyright
2026 Affaan Mustafa). Its MIT notice is included in [LICENSE](LICENSE).

Some upstream ECC files were machine-local ignored files, so I can't name a precise
upstream commit for them. The package includes their actual contents instead of
depending on a global ECC install.

## Disciple extracts and harness repairs

I extracted the custom team roles and repairs from the user's Disciple OpenCode
configuration. The source snapshot is `d3af24b9`; harness repairs are committed as
`8762c355` on branch `fix/opencode-toolkit`. The Disciple repository URL and source
weren't available in the export. I retained those commit identifiers as supplied,
but I didn't independently verify them.

The portable export uses an allowlist. It excludes application source, deployment
addresses, project instructions/history, secrets, provider credentials, generated
plugin artifacts, and machine-specific MCP settings. A curated subset of skills
is bundled. Other optional skills and tools aren't bundled or silently installed.

## Adapted Matt Pocock skills

Six self-contained skills derive from
[Matt Pocock's skills](https://github.com/mattpocock/skills), pinned to commit
`abeeaf95660ba9e8b7c753eb38f441ca707a8823` (MIT, Copyright (c) 2026 Matt Pocock).
The full upstream notice ships in `bundle/skills/LICENSE.mattpocock.txt`, including
in installed distributions.

- `bundle/skills/toolkit-grilling/SKILL.md`: productivity/grilling
- `bundle/skills/toolkit-handoff/SKILL.md`: productivity/handoff
- `bundle/skills/toolkit-questionnaire/SKILL.md`: productivity/to-questionnaire
- `bundle/skills/toolkit-diagnosing-bugs/SKILL.md`: engineering/diagnosing-bugs
- `bundle/skills/toolkit-tdd/SKILL.md`: engineering/tdd, with its `tests.md` and
  `mocking.md` guidance inlined
- `bundle/skills/toolkit-retro/SKILL.md`: engineering/retro

Those source paths are under upstream `skills/`. The exact mapping and adaptation
catalog is `bundle/skills/provenance.json`. Each skill also carries attribution.

These are adapted text, not an upstream dependency, submodule, remote catalog,
installer, or auto-updater. They need no runtime network fetch or upstream script.
I omitted the upstream human-in-the-loop script and inlined its useful question
protocol.

The adaptations allow manager-initiated use while keeping project scope and
authorization. Managers own depth-one coordination; leaves don't spawn agents.
Material choices wait for answers; routine judgments don't need new ceremony.
Handoffs, questionnaires, and learning proposals stay response-first. Persistence
and external actions need the applicable consent. Retrospective candidates need
evaluation and authorized promotion, never automatic policy edits or wider
permissions. Standalone upstream `codebase-design` isn't included.

## Managed RTK

The installer can provision the Apache-2.0 OSS edition of
[RTK](https://github.com/rtk-ai/rtk) v1.2.1, not the general `rtk-*` assets. The
upstream license and install metadata ship beside the managed binary. A checksum
match proves the reviewed archive was copied; it doesn't prove publisher
authenticity, reproducible builds, or runtime safety. See
[bundle/tools/rtk-install.md](bundle/tools/rtk-install.md) for the pin and limits.
