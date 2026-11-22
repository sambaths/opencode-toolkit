---
name: toolkit-grilling
description: Resolve consequential uncertainty in a plan or decision with dependency-aware question rounds. Managers invoke this when material choices remain after inspecting discoverable facts, or when the user asks to stress-test an idea.
license: MIT
---

# Decision frontier

Use bounded questioning to settle material choices, not to transfer routine engineering judgment to the user. Invocation does not expand the task's scope or authorization. The manager owns coordination; a leaf reports specialty needs to the manager and never spawns another agent.

## 1. Establish the decision boundary

Read the goal, constraints, acceptance criteria, and prior decisions. Inspect relevant authorized project facts before asking about them. Separate facts, reversible judgment calls, and consequential unresolved choices. Resolve routine choices locally using project conventions; state assumptions where useful.

Done when each material uncertainty is either supported by evidence or identified as a human decision. If another specialty is needed, the manager may coordinate within the existing fanout limit; a leaf returns the need instead.

## 2. Map dependencies

Model the remaining choices as a decision tree. The **frontier** contains only choices whose prerequisites are settled. A choice depending on an unanswered question belongs in a later round. Pending factual investigation is also an unsettled prerequisite.

Prioritize decisions that block the next authorized action. Set a question budget appropriate to the task; default to at most three questions per round. Defer distant branches rather than exhaustively designing work outside scope.

## 3. Ask a numbered round

For each frontier choice, show:

```text
Round 1 — Q1: <one decision and its consequence>
Options: <bounded alternatives, including unknown/defer where useful>
Recommendation: <specific choice and brief reason>
Does this recommendation fit? (“Yes” accepts this stated choice.)
```

Wait for answers to material user choices before taking dependent actions. A “yes” accepts the stated recommendation only: it is not permission to implement, publish, spend, or change permissions beyond existing authorization. Silence is not consent. Partial answers and “unknown” are valid; record their implications and continue only on unblocked work.

## 4. Recompute and stop

Summarize settled choices, update the frontier, and ask another round only if a material blocker remains. Stop when the next in-scope action is determined, the question budget is reached, or the user defers. Report deferred decisions, assumptions, and the next authorized action. For a plan-only task, deliver the decision summary rather than implementing it.

## Attribution

Adapted from Matt Pocock's `skills/productivity/grilling/SKILL.md` at commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823` in https://github.com/mattpocock/skills. Copyright (c) 2026 Matt Pocock; MIT. Full notice: [LICENSE.mattpocock.txt](../LICENSE.mattpocock.txt). Adaptations: bounded rounds, autonomous routine judgment, scope-aware consent, and manager-only coordination.
