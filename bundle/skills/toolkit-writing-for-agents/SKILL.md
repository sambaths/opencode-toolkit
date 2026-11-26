---
name: toolkit-writing-for-agents
description: Write or revise agent-consumed documents such as skills, AGENTS.md or CLAUDE.md pointers, and project docs. Use when triggers misfire, a pointer is vague, an agent misses needed detail, instructions sprawl, or a new skill needs predictable loading.
license: MIT
---

# Documents agents actually follow

Apply this when the audience is an agent taking a repeatable process, not a human reading once. It covers skills, always-loaded instruction files, and docs reached through a pointer. Editing is allowed only inside the task's authorized scope; invoking this skill grants no extra write space. Leaves return cross-specialty needs to the manager and never spawn another agent.

## Start from the trigger

Write down the branch this document must catch: the concrete situation, user phrasing, file type, or task phase. One branch per trigger; collapse synonyms that name the same case. Put the leading word first, because the pointer's wording, not its target, decides whether the agent reaches it.

Test the wording by asking whether a fresh agent would load this material for that branch. Keep the pointer's description concrete and short enough to earn its always-loaded cost.

Done when each pointer names the material, its branches, and any exclusion that prevents a false trigger.

## Disclose by need

Rank material by how immediately the agent needs it:

1. In-file steps the agent performs in order.
2. In-file reference every branch needs.
3. Disclosed reference only some branches reach.

This ladder is **progressive disclosure**. Push down what only one branch needs, and keep shared definitions and ordering next to the step that uses them. Group a concept's definition, rules, and caveats together. Split a long sequence only when later steps tempt premature completion, and prefer a real handoff over an inline split. Keep local links resolvable inside the project so the document works without an external repository checkout, network fetch, or helper script.

## Bound each step

Give every step a completion criterion the agent can check. Prefer exhaustive, checkable wording ("every caller accounted for") over mood words ("be thorough"). Add a stop condition for the whole document: what must be true before the agent reports done, hands off, or asks for authorization.

## Prune

Keep one authoritative place per meaning. Treat environment facts such as package scripts, directory layout, and `--help` output as lookups rather than cached prose unless the reason or gotcha is otherwise invisible. Remove whole no-op sentences that restate model defaults. Report stale or duplicated guidance instead of quietly expanding scope.

## Checklist before delivery

- Every pointer has a branch and a leading term.
- Every step has a completion criterion.
- Local links resolve inside the project; outside references stay plain text.
- No duplicated meaning, mandatory external checkout, or script requirement.
- The document states its stop condition and authorization boundary.

Stop when the checklist passes or the remaining pointer or ownership question is reported. Do not expand into unrelated documents.

Report what changed, what was pruned, and which pointer or ownership assumption remains unverified. Do not claim an agent will follow the document; that needs runtime evidence.

## Attribution

Adapted from Matt Pocock's `skills/productivity/writing-for-agents/SKILL.md` at commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823` in https://github.com/mattpocock/skills. Copyright (c) 2026 Matt Pocock; MIT. Full notice: [LICENSE.mattpocock.txt](../LICENSE.mattpocock.txt). Adaptations: in-tree pointers only, always-loaded pointer cost and trigger wording, progressive disclosure, completion criteria, and no-mandatory-external-reference guidance.
