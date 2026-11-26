---
name: toolkit-domain-modeling
description: Build and sharpen a project's glossary and architecture decisions. Use when terms are ambiguous or conflict, code and domain language disagree, a hard-to-reverse choice needs an ADR, or the user asks for a glossary or domain-model review.
license: MIT
---

# Sharpen the model, then record it

Domain modeling is the active discipline of challenging terms, testing edge-case scenarios, and writing decisions down when they crystallize. Reading a glossary for vocabulary is not this skill. Editing the glossary or an ADR is allowed only inside the authorized documentation scope; otherwise propose the change and stop. Leaves return cross-specialty needs to the manager and never spawn another agent.

## Challenge the language

- When a term conflicts with the existing glossary, say so immediately and ask which meaning is intended.
- When a term is vague or overloaded, propose one precise canonical term and name what it excludes.
- Stress-test relationships with concrete scenarios that probe boundaries and edge cases.
- When the user describes behavior, compare it with the code and surface contradictions rather than smoothing them over.

## Write `GLOSSARY.md` when a term resolves

Create the file lazily when the first term is settled. Keep it a glossary, not a specification, scratch pad, or implementation log. A compact format is enough:

```text
| Term | Definition | Aliases | Boundaries |
| --- | --- | --- | --- |
| <canonical term> | <one-sentence meaning> | <avoided names> | <what it is not> |
```

Prefer one root `GLOSSARY.md`. If the project has multiple bounded contexts, a root `GLOSSARY-MAP.md` may point to each context's glossary; create that map only when the second context exists.

## Offer an ADR only when all three hold

1. The decision is hard to reverse.
2. A future reader would be surprised without the context.
3. Real alternatives existed and one was chosen for specific reasons.

If any condition is missing, skip the ADR. Create `docs/adr/` lazily when the first accepted decision needs a record. A compact record covers title, status and date, context, decision, consequences, and considered alternatives. Do not record reversible routine choices or implementation detail in the glossary.

## Scope and stop

Keep writes to the glossary and ADR locations the project already uses, or to destinations the user authorizes. Do not fetch an external repository, run a helper script, or bundle upstream companion formats. Stop when the terms and decisions are recorded, or when the proposed glossary/ADR text and remaining ambiguity are delivered for review.

## Attribution

Adapted from Matt Pocock's `skills/engineering/domain-modeling/SKILL.md` at commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823` in https://github.com/mattpocock/skills. Copyright (c) 2026 Matt Pocock; MIT. Full notice: [LICENSE.mattpocock.txt](../LICENSE.mattpocock.txt). Adaptations: inline glossary and ADR formats, lazy file creation, authorized-write boundary, leaf-only scope, and no external checkout or scripts.
