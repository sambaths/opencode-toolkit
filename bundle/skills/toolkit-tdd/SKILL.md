---
name: toolkit-tdd
description: Implement authorized behavior changes or bug fixes in vertical test-first slices, with independently derived expected results and public-interface regression coverage. Use for red-green development in the project's existing test framework.
license: MIT
---

# Vertical test-first slices

Start from the goal, acceptance criteria, project instructions, and nearby tests. Read relevant glossary/ADRs when present. Discover the actual test commands and framework; use established conventions. This skill does not authorize implementation in a plan-only task, a new test stack, broader refactoring, or Git/publication actions.

## Choose a behavior seam

A **seam** is a caller-visible boundary where the required behavior can be exercised and observed. Select the existing interface that catches the real scenario, including multiple callers or integration boundaries when the bug requires them. State what it catches and what it cannot verify. Make obvious, reversible seam choices autonomously; ask only when the interface or test scope is a consequential unresolved decision. If no appropriate seam exists, report the limitation and propose a bounded option rather than manufacturing false confidence.

## Red → green, one slice at a time

1. Pick one observable behavior from the acceptance criteria. Express its expected result using an independent source: a specified literal, a worked example, a documented invariant, or known-good external evidence.
2. Write one focused test through the chosen seam. Run it and verify it fails because the behavior is missing or wrong, not because of syntax, imports, unavailable services, or broken setup. Record the command and failure.
3. Implement only enough to satisfy that slice. Run the focused test and confirm green. For a bug fix also replay the original scenario when feasible.
4. Select the next behavior based on what the last slice taught you. Repeat rather than writing a horizontal batch of imagined tests followed by all implementation.
5. Run related existing tests and required project checks. Keep optional cleanup separate from the behavior change; do not expand scope to redesign internals. If authorized refactoring is needed, preserve green behavior tests throughout.

Done when the acceptance behaviors are covered at suitable seams, the observed red/green evidence is recorded, and unverified cases are explicit. When a test cannot be run, report that fact; do not claim a red or green result.

## Tests worth keeping

Name tests for what a caller can do or observe. Prefer checking a created record through its retrieval interface rather than inspecting private storage, unless the persistence contract itself is the seam. Assertions should survive an internal refactor that preserves behavior. Multiple assertions may describe one coherent outcome; avoid unrelated scenarios in one test.

An independent expected value can disagree with the implementation:

```text
Good: total([{price: 10}, {price: 5}]) equals 15 (worked example).
Weak: expected = items.reduce(the same algorithm as total); compare total to expected.
Good: createUser("Alice"), then getUser(id) returns name "Alice".
Weak: assert a private helper ran, when the contract is a retrievable user.
```

Snapshots and fixtures need a reviewed source of truth; copying current output alone does not establish correctness. Internal call counts/order are useful only when they are themselves an observable contract, not as a proxy for results.

## Mock boundaries, keep behavior real

Prefer real local collaborators. Substitute external APIs, time, randomness, or filesystem/database boundaries when required for deterministic, isolated tests; follow the project's existing integration-test approach. Do not contact production services or spend money to make a test pass without authorization.

Pass a boundary dependency through an existing injection seam where possible. Operation-specific fakes such as `getUser(id)` and `createOrder(data)` are easier to reason about than a generic fake fetcher full of endpoint conditionals. Assert observable effects and outputs rather than mocking every internal method. Document what a fake cannot establish and cover integration contracts with available appropriate checks.

## Handoff

Report changed behavior, files, exact commands/results, and coverage gaps. These are implementation self-checks. The manager arranges independent review when warranted and within the allowed fanout; a leaf returns review needs rather than launching another agent. No external skill is required to execute this workflow.

## Attribution

Adapted from Matt Pocock's `skills/engineering/tdd/SKILL.md`, `tests.md`, and `mocking.md` at commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823` in https://github.com/mattpocock/skills. Copyright (c) 2026 Matt Pocock; MIT. Full notice: [LICENSE.mattpocock.txt](../LICENSE.mattpocock.txt). Adaptations: supporting guidance inlined, existing-stack seam judgment, bounded refactoring, and no mandatory external skills or child reviewers.
