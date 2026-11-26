---
description: Generate skills from git history analysis
agent: build
---

# Skill Create Command

Create a domain skill from verified evidence, then measure it on held-out cases:
$ARGUMENTS

## Your Task

1. **Define the domain and task boundary.** Name the users, in-scope tasks,
   out-of-scope/high-risk actions, and measurable success criteria.
2. **Gather evidence.** Use primary sources and representative examples. Record
   URLs/versions or local paths. Separate facts from hypotheses; generic model
   knowledge isn't domain validation.
3. **Build a real OpenCode skill.** Create
   `.opencode/skills/<domain>/SKILL.md` with YAML `name` and `description`
   frontmatter, activation triggers, workflow, sourced facts, decision rules,
   examples, failure modes, and safety boundaries.
4. **Create an evaluation suite before tuning.** Put representative authoring
   cases in a separate `authoring_suite_id`. Reserve unseen cases under a unique
   `held_out_suite_id`. Each held-out case needs a stable ID, baseline result,
   candidate result, evidence, and a `critical_failure` flag. Don't inspect or
   tune on held-out answers while writing the skill.
5. **Evaluate, report, and gate.** Run
   `node .opencode/tools/evaluate-skill.mjs <evaluation.json>` from the project root.
   Report the input SHA-256, held-out pass rate, baseline delta, critical failures,
   and reproducibility details. Passing requires >=80% candidate pass rate, zero
   critical failures, and no regression of 5 percentage points or more versus
   baseline. A pass is evidence, not authority to install/adopt; ask the user for
   explicit approval.

## Evaluation input format

```json
{
  "authoring_suite_id": "domain-v1-authoring",
  "held_out_suite_id": "domain-v1-heldout-sealed",
  "cases": [
    {
      "id": "case-001",
      "split": "held_out",
      "baseline_pass": true,
      "candidate_pass": true,
      "critical_failure": false,
      "evidence": "Expected outcome and observed evidence"
    }
  ]
}
```

Results need case-level evidence, not the author's subjective score. Mark unsafe,
unauthorized, or fabricated high-impact advice as a critical failure. Without an
independent grader or sealed held-out suite, call the skill **unevaluated**;
don't claim quantified expertise.
