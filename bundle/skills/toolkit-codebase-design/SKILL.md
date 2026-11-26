---
name: toolkit-codebase-design
description: Design or review module interfaces using deep-module, seam, and depth vocabulary. Use when choosing where an interface lives, reducing pass-through APIs, improving testability or AI navigability, or requesting a read-only design review.
license: MIT
---

# Deep modules at clean seams

Use this vocabulary whenever code is being designed or restructured. The aim is leverage for callers, locality for maintainers, and a test surface everyone can use. Design review is read-only unless implementation is separately authorized. Leaves report cross-specialty needs to the manager and never spawn another agent.

## Glossary

Use these terms consistently.

- **Module**: anything with an interface and an implementation, from a function to a package or a tier-spanning slice.
- **Interface**: everything a caller must know to use the module correctly, including invariants, ordering, error modes, required configuration, and performance characteristics. It is wider than a type signature.
- **Implementation**: the body of code inside a module.
- **Depth**: leverage at the interface, meaning how much behavior a caller or test can exercise per unit of interface they must learn. A **deep** module hides a large implementation behind a small interface; a **shallow** module exposes an interface nearly as complex as its implementation.
- **Seam**: the place where an interface lives and behavior can be changed without editing that place.
- **Adapter**: a concrete thing that satisfies an interface at a seam. One adapter makes a seam hypothetical; two adapters make it real.
- **Leverage**: what callers gain from depth. **Locality**: what maintainers gain when change and verification concentrate in one place.

## Design checks

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across callers, it was earning its keep.
- **Interface as test surface**: callers and tests cross the same seam. Testing past the interface usually means the module has the wrong shape.
- **Hide composition**: a deep module may contain small, mockable parts internally. They do not belong in the public interface.
- **Reduce the surface**: fewer methods, simpler parameters, and fewer required facts make a module easier to use and test.
- **Accept dependencies, return results**: pass collaborators in and return outcomes rather than creating hidden dependencies or mutating callers' state.

## Read-only design review

1. Read the module's callers, tests, public surface, and relevant project instructions. State the behavior, invariants, error modes, ordering, configuration, and performance the interface must carry.
2. Map the seam: which callers depend on it, which tests cross it, and what actually varies across it. Do not introduce a seam for one hypothetical adapter.
3. Apply the deletion test and look for pass-through wrappers, leaky parameters, hidden dependencies, and side effects.
4. Propose at most a few interface shapes in text. Compare depth, locality, seam placement, and testability; name the tradeoff and what evidence would change the recommendation.
5. Stop before editing. Implementation, migration, or refactoring needs separate authorization.

## Scope and stop

Keep the review bounded to the named module and its real callers; do not fetch an external repository, run a helper script, or adopt upstream companion files that were not bundled. Stop when the current shape, the recommended shape, the seam decision, and the remaining uncertainty are stated. If the user asked only for a review, deliver the review and stop.

## Attribution

Adapted from Matt Pocock's `skills/engineering/codebase-design/SKILL.md` at commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823` in https://github.com/mattpocock/skills. Copyright (c) 2026 Matt Pocock; MIT. Full notice: [LICENSE.mattpocock.txt](../LICENSE.mattpocock.txt). Adaptations: core deep-module, seam, and read-only review guidance only; upstream `DEEPENING.md` and `DESIGN-IT-TWICE.md` are not bundled; leaf-only scope and no external checkout or scripts.
