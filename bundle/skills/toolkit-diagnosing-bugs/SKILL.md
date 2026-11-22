---
name: toolkit-diagnosing-bugs
description: Diagnose failures or performance regressions using an exact-symptom feedback loop, minimized reproduction, ranked hypotheses, and targeted probes. Use for debugging or diagnosis-only work without assuming permission to fix.
license: MIT
---

# Exact-symptom diagnosis

Read the reported symptom, expected behavior, prior attempts, and applicable project instructions. Inspect nearby tests, relevant glossary/ADRs, and actual verification commands. Preserve the task boundary: diagnosis-only work ends with findings and a proposed fix, not implementation. Skill invocation and user silence confer no extra authorization. Leaves return cross-specialty needs to the manager; they never spawn agents.

## 1. Build a tight feedback loop

Choose the smallest existing seam that drives the actual failure: a failing test, local HTTP request, fixture-driven CLI, browser assertion, sanitized trace replay, or isolated harness. Use the project's stack rather than installing a new one. Assert the user's exact error, wrong result, or latency criterion; “did not crash” is insufficient.

Run the loop and record the command, sanitized output, and relevant environment conditions. Pin time/randomness or isolate external state where practical. For intermittent failures, report attempts and observed failure rate; bounded local repetitions may help, but stress/load testing, production access or instrumentation, state-changing replays, and Git bisection or destructive operations require applicable authorization. Set a run/time budget before costly experiments.

If a human must reproduce it, give one bounded trial protocol in the response: prerequisites, exact steps, expected versus observed result, trial number/time, and which redacted output to return. Ask them to report pass/fail/unknown. Wait for that observation before interpreting the trial; no shell script is required.

Done when the loop demonstrably catches this symptom and its limitations are known. If blocked, report attempts and request the smallest missing artifact or permission. Do not present an untested theory as a diagnosis.

## 2. Reproduce and minimize

Confirm the observed failure matches the reported one. Remove inputs, setup, callers, or steps one at a time, rerunning after each change. Keep the smallest scenario that still fails within the investigation budget; state any unreduced dependencies or nondeterminism. Preserve the original scenario for final verification.

## 3. Rank hypotheses

List three to five plausible causes, or fewer if evidence sharply constrains the space. For each give supporting evidence and a falsifiable prediction: “If X causes this, changing Y should produce Z.” Rank them before probing to limit anchoring. Share the ranking for domain feedback; continue only with already-authorized low-risk probes, not on the assumption that silence approves new actions.

## 4. Probe one variable

Map each debugger observation, targeted log, or experiment to a prediction. Prefer the least invasive probe. Tag temporary instrumentation with a unique prefix and track its cleanup. Avoid broad data dumps; inspect only authorized evidence and redact secrets or personal information before reporting. For performance problems establish a repeatable baseline, workload, and measurement conditions before comparing variants.

Done when evidence distinguishes a cause, disproves the current candidates, or reaches the budget. Revise hypotheses explicitly rather than quietly changing the story.

## 5. Regression and closure

If fixing is authorized, convert the minimized reproduction into a failing regression test at a seam that preserves the real failure pattern. Watch the test fail for the intended reason, apply the smallest fix, then rerun that test and the original scenario. If no suitable seam exists, report the coverage gap instead of substituting a shallow test that cannot catch the bug.

Remove only your temporary probes and artifacts within authorized write scope; preserve unrelated work. Report cause and confidence, exact commands/results, failed hypotheses, changed files if any, remaining limitations, and proposed next action. A green local loop is a self-check, not independent review or proof about production. Commit/publish only when separately authorized.

## Attribution

Adapted from Matt Pocock's `skills/engineering/diagnosing-bugs/SKILL.md` at commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823` in https://github.com/mattpocock/skills. Copyright (c) 2026 Matt Pocock; MIT. Full notice: [LICENSE.mattpocock.txt](../LICENSE.mattpocock.txt). Adaptations: inline human trial protocol (upstream script omitted), bounded probes, diagnosis-only preservation, and explicit operational authorization.
