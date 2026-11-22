# Provenance

Retained ECC agent prompts, command templates, and the skill evidence evaluator
derive from Everything Claude Code, https://github.com/affaan-m/ECC (MIT,
copyright 2026 Affaan Mustafa). The MIT notice is included in LICENSE.

Custom team roles and repairs were extracted from the user's Disciple OpenCode
configuration. Disciple source snapshot: d3af24b9; harness repairs are committed
as 8762c355 on branch fix/opencode-toolkit. Some upstream ECC files were machine-local ignored
files, so a precise upstream commit for those files is unknown. This package
includes their actual contents rather than relying on a global ECC installation.

The portable export is allowlisted. It excludes application source, deployment
addresses, project instructions/history, secrets, provider credentials, generated
plugin artifacts, and machine-specific MCP settings. A curated subset of skills
is bundled as described below. Other optional skills and tools are not bundled
and are never silently installed.

## Adapted Matt Pocock skills

Six self-contained skills derive from https://github.com/mattpocock/skills,
pinned to commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823` (MIT,
Copyright (c) 2026 Matt Pocock). The full upstream license notice ships in
`bundle/skills/LICENSE.mattpocock.txt`, including in installed distributions.

- `bundle/skills/toolkit-grilling/SKILL.md`: productivity/grilling
- `bundle/skills/toolkit-handoff/SKILL.md`: productivity/handoff
- `bundle/skills/toolkit-questionnaire/SKILL.md`: productivity/to-questionnaire
- `bundle/skills/toolkit-diagnosing-bugs/SKILL.md`: engineering/diagnosing-bugs
- `bundle/skills/toolkit-tdd/SKILL.md`: engineering/tdd, including inlined
  guidance from its `tests.md` and `mocking.md`
- `bundle/skills/toolkit-retro/SKILL.md`: engineering/retro

Source paths above are under upstream `skills/`; the exact file mapping and
adaptation catalog is `bundle/skills/provenance.json`. Each skill also carries
source attribution. These are adapted text, not an upstream dependency,
submodule, remote skill catalog, installer, or auto-updater. No runtime network
fetch or upstream script execution is required. The upstream human-in-the-loop
script is omitted; its useful question protocol is inlined.

Adaptations permit useful manager-initiated invocation while preserving project
scope and authorization. Managers own depth-one coordination; leaves do not
spawn agents. Material choices wait for answers, while routine judgments need
no new user ceremony. Handoffs, questionnaires, and learning proposals are
response-first; persistence and external actions require the applicable consent.
Retrospective candidates require evaluation and authorized promotion, never
automatic policy edits or permission widening. Standalone upstream
`codebase-design` is not included.
