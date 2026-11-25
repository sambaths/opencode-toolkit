---
description: Create implementation plan with risk assessment
agent: manager
subagent: false
---

# Plan Command

Create a plan at the level of detail the request warrants for: $ARGUMENTS

Follow the shared Plan-first handoff contract.

## Your Task

1. Honor the user's requested scope and constraints (including plan-only and no-Git/no-tracking).
2. Ask only questions whose answers could materially change the plan; otherwise state assumptions.
3. Scale the plan: a short plan for simple work; dependencies/risks/validation for complex work.
4. Return the plan and stop. Do not execute it unless the user separately asks.

## Output Format

### Requirements Restatement
[Goal, scope, and non-goals]

### Affected Files and Seams
[Files, interfaces, and test seams involved]

### Implementation Phases
[Phase 1: Description]
- Step 1.1
- Step 1.2
...

[Phase 2: Description]
- Step 2.1
- Step 2.2
...

### Acceptance Criteria
[A1, A2, ... with expected observable outcomes]

### Baseline and Verification
[Baseline checks and exact verification commands]

### Dependencies
[Ordered dependencies, APIs, services, or prerequisites]

### Risks and Assumptions
- HIGH: [Critical risks that could block implementation]
- MEDIUM: [Moderate risks to address]
- LOW: [Minor concerns]

### Repair Limit
[Default: at most two attempts per failure]

### Estimated Complexity
[HIGH/MEDIUM/LOW with time estimates]

Do not add an approval gate unless the user asked for one or the plan includes a materially risky decision that needs their choice.

---

Planning is non-executing by default. Do not use Git, GitHub, tickets, or trackers unless explicitly requested.
