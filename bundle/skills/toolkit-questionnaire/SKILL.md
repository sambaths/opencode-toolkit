---
name: toolkit-questionnaire
description: Draft an asynchronous questionnaire when a decision is blocked on another person's knowledge, or the user requests one. Managers may draft autonomously after checking discoverable facts; sending and saving require separate authority.
license: MIT
---

# Knowledge-gap questionnaire

Use a questionnaire for facts or decisions held by a person, not for information available in authorized project sources. First inspect those sources. If routine engineering judgment resolves the issue, make that judgment instead of creating a questionnaire.

## Identify the send

Establish the recipient's role, expertise, relationship to the requester, and the concrete answers needed. Reuse supplied context. If missing information materially changes the questions, ask a single bounded clarification about recipient and required outcome; do not ask the requester to supply the knowledge they need from the recipient. For a useful draft with an unknown recipient, label the assumed role and placeholders explicitly.

Done when every required answer maps to a blocked decision or next action and the intended recipient can reasonably supply it.

## Draft for partial answers

Order questions by importance: an asynchronous recipient may answer only the first few. Each question covers one topic and has an answer stub immediately below it. Group by theme when there are more than a handful. Add a one-line reason only where it prevents ambiguity. Prefer concrete examples, ranges, or constraints to broad requests for opinions.

Use this structure in the response:

```markdown
# <Topic> discovery questionnaire
Purpose: <decision these answers will enable>
From: <requester or placeholder>
To: <recipient or role>
How answers will be used: <next step>

## Context
<One short paragraph sufficient for someone outside the conversation.>

## How to answer
<Known deadline and expected effort; label either unknown if needed.>
Partial answers and “I don't know” are welcome. Flag uncertainty.

## <Theme>
### 1. <Single-topic, highest-priority question>
<Optional reason.>
Answer:

## Anything else?
What should we know that these questions missed?
Answer:
```

Check that every required answer is covered and remove questions unrelated to the decision. Avoid invented deadlines, promises, confidential context, or requests for credentials.

## Delivery boundary

Return a draft, not a sent message. Drafting does not authorize contacting the recipient, publishing, or saving a document. Save or send only under applicable explicit authorization or a configured project workflow that permits that action; verify recipient and destination before an authorized send. A leaf returns the draft or blocker to its manager and does not launch specialists.

## Attribution

Adapted from Matt Pocock's `skills/productivity/to-questionnaire/SKILL.md` at commit `abeeaf95660ba9e8b7c753eb38f441ca707a8823` in https://github.com/mattpocock/skills. Copyright (c) 2026 Matt Pocock; MIT. Full notice: [LICENSE.mattpocock.txt](../LICENSE.mattpocock.txt). Adaptations: fact-first drafting, prioritized questions, no automatic file writes or sends, and scope-aware autonomy.
