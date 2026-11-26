---
description: Run a genuinely independent, two-round expert council in this top-level session
agent: moderator
subagent: false
---

Run a genuine two-round expert council for: $ARGUMENTS

Run this in the current top-level session, never as a subagent. Identify the
relevant experts. Call them directly and in parallel for round one, then again
for round two with anonymized competing positions. Each expert must give an
independent evidence-backed position, evidence, risks, confidence, estimate, and
what would change their mind.

Keep a speaker ledger. Record missing or unsupported responses honestly, and
report tool/depth limits without calling the affected round independent. Don't
add a third round unless the user explicitly asks to restart.

Experts are leaf agents: supply the required project context and have them return missing-specialty requests to you. Run notes/tracking only when requested or required by the active project. Shell access follows the shared policy and is for context/checks, not product edits.

Conclude with the explicit handoff: this command selects moderator in the current session; it does not automatically restore manager. The user can run `/orchestrate <next task>` for manager-led implementation, or select manager through `/agents`. Do not claim an automatic switch or treat recommendations as authorization to implement.
