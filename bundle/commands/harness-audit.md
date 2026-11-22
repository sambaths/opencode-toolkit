---
description: Evidence-backed audit of agent, command, permission, and dependency consistency
agent: manager
subagent: false
---

Audit the requested harness scope without editing: $ARGUMENTS

Inspect configuration, agents, commands, shared instructions, and referenced dependencies. Check duplicate definitions, ordered permission overrides, role/capability conflicts, delegation depth, command targets, missing files/tools/skills, portability, and project-policy conflicts.

Use current official documentation for runtime semantics. Distinguish confirmed static findings from runtime-dependent risks. Return severity-ranked findings with exact paths/lines, impact, suggested fixes, and limitations. Do not invent numeric scores, claim deterministic evaluation, or run a missing audit script. Stop after evaluation unless fixes are separately requested.
