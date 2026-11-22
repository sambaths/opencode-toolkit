---
description: Generate skills from git history analysis
agent: build
---

# Skill Create Command

Create a domain skill from verified evidence, then measure whether it improves
held-out performance: $ARGUMENTS

## Your Task

1. **Define the domain and task boundary.** Clarify the intended users, in-scope
   tasks, out-of-scope/high-risk actions, and measurable success criteria.
2. **Gather evidence.** Use primary sources and representative examples. Record
   source URLs/versions or local paths; distinguish verified facts from
   hypotheses. Do not present generic model knowledge as domain validation.
3. **Build a real OpenCode skill.** Create
   `.opencode/skills/<domain>/SKILL.md` with YAML `name` and `description`
   frontmatter, activation triggers, workflow, sourced facts, decision rules,
   examples, failure modes, and explicit safety boundaries.
4. **Create an evaluation suite before tuning.** Put representative authoring
   cases in a separate `authoring_suite_id`; reserve unseen cases under a unique
   `held_out_suite_id`. Each held-out case needs a stable ID, a baseline result,
   candidate result, evidence, and a `critical_failure` flag. Do not tune on or
   inspect held-out answers while writing the skill.
5. **Evaluate, report, and gate.** Run
   `node .opencode/tools/evaluate-skill.mjs <evaluation.json>` from the project root. Report the input SHA-256,
   held-out pass rate, baseline delta, critical failures, and reproducibility
   details. Passing requires >=80% candidate pass rate, zero critical failures,
   and no regression of 5 percentage points or more versus baseline. A pass is
   evidence—not authority to install/adopt: ask the user for explicit approval.

## Analysis Process

### Evaluation input format

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

Results must come from case-level evidence, not the skill author's subjective
score. Mark unsafe, unauthorized, or fabricated high-impact advice as a critical
failure. If no independent grader or sealed held-out suite exists, say the skill
is **unevaluated**; do not claim quantified expertise.

---

**TIP**: Run `/skill-create --instincts` to also generate instincts for continuous learning.
