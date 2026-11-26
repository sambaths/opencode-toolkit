---
description: Independently review designated changes against requirements and project standards
agent: reviewer
subagent: true
---

Review: $ARGUMENTS

Determine the requested target before reviewing. Honor explicit files, commit ranges, base branches, or staged/unstaged scope. If omitted, inspect working-tree changes and report that scope; do not imply committed changes were reviewed. If there are no changes, ask for a target.

Check correctness, security, regressions, acceptance criteria, test evidence, and applicable project standards. Report actionable findings by severity with real file:line references and impact/reproduction. Anchor findings to the originating issue/spec and acceptance criteria, not only to the tests. Avoid arbitrary line-count, immutability, or coverage rules unless the project requires them.

Return a verdict and limitations. Do not fix files, mutate trackers, or claim independent review if you authored the work. Follow the project's Report contract when present.
