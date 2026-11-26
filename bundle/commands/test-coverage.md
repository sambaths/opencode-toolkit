---
description: Analyze and improve test coverage
agent: tdd-guide
subagent: true
---

# Test Coverage Command

Analyze test coverage and identify gaps: $ARGUMENTS

## Your Task

1. Find and run the project's coverage command, if configured.
2. Identify low-coverage areas.
3. Prioritize critical behavior first.
4. Generate missing tests at existing seams.

Use targets defined by the project or user. Without a target, report measurements
and meaningful uncovered behavior; don't fail an arbitrary percentage.

## Coverage Report Analysis

### Summary

```text
File           | % Stmts | % Branch | % Funcs | % Lines
---------------|---------|----------|---------|--------
All files      |   XX    |    XX    |   XX    |   XX
```

### Low Coverage Files

[Files below target, ordered by criticality]

### Uncovered Lines

[Specific lines that need tests]

## Test Generation

For each gap, return:

- function/component name
- location such as `src/path/file.ts:123`
- coverage gap
- suggested tests for expected behavior, edge cases, and errors

Use the project's test style and framework. Don't invent a new stack.

## Coverage Improvement Plan

1. **Critical**: add now, such as auth or payment behavior.
2. **High**: add in the current authorized scope.
3. **Medium**: add when touching the file.

Coverage is a metric, not a goal. Favor meaningful tests over hitting numbers.
