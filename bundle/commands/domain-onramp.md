---
description: Run a read-only domain onramp through frame, retrieve, model, probe, and teach-back before slicing or handing off
agent: manager
subagent: false
---

Run the requested domain onramp in the current manager session: $ARGUMENTS

This is read-only by default. Do not implement, edit product code, publish, deploy, or spend unless the user separately authorizes it. Probes are actions: get explicit authorization before running a command that changes state, costs money, or touches a system outside the authorized project. Invocation grants no extra authority.

1. **Frame.** Write the decision or task, scope, non-goals, acceptance, known constraints, and the unknowns that block progress. Use `toolkit-grilling` for material user choices after inspecting discoverable facts; do not ask about routine steps.
2. **Retrieve.** Read project instructions, nearby code, tests, and primary external sources. Cite exact paths or URLs and distinguish observed facts from memory. Do not require an external repository checkout, network fetch, or helper script.
3. **Model.** Build the working vocabulary and system model. Use `toolkit-domain-modeling` to propose glossary terms and, when the thresholds are met, an ADR. Name actors, boundaries, invariants, and contradictions between code and language.
4. **Probe.** Run only authorized, bounded checks that distinguish competing explanations. Record the exact command, expected versus observed result, environment, and limits. A read-only inspection needs the same honesty about what it did not cover.
5. **Teach-back.** Explain the model in plain language: what the evidence supports, what remains uncertain, and what would change the conclusion. Invite correction before treating the model as settled.
6. **Slice or hand off.** Propose the smallest implementation slice with acceptance and verification, or use `toolkit-handoff` to pass the model, evidence, limits, and next action. Stop before implementation unless it is separately authorized.

Use existing roles in plain text where they fit: `researcher` for evidence gathering, `architect` or `reviewer` for design and independent review, `planner` for slices, and `build` or `senior-developer` for implementation only after authorization.

Report evidence and limits explicitly. Do not claim live model behavior, provider availability, or macOS/Windows execution that was not observed. Stop when the teach-back is complete and the next slice or handoff is named, or when a material decision needs the user.
