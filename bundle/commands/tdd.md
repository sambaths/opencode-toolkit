---
description: Apply test-first development using the active project's test conventions
agent: tdd-guide
subagent: true
---

# TDD Command

Implement this with test-driven development: $ARGUMENTS

## TDD Cycle (MANDATORY)

```
RED → GREEN → REFACTOR → REPEAT
```

1. **RED**: When the task calls for tests and the project has a suitable seam, write a failing test first.
2. **GREEN**: Write the minimum change that satisfies the test and request.
3. **REFACTOR**: Refactor only where useful, keeping relevant checks green.
4. **REPEAT**: Continue until the requested scope is complete.

## Your Task

### Step 1: Learn the project

Identify the language, framework, test tools, conventions, and instructions.
Don't impose a language-specific scaffold.

### Step 2: Write Failing Tests (RED)

- Exercise the interface.
- Cover happy paths, edge cases, and errors.
- Run the tests and verify they fail.

### Step 3: Implement Minimal Code (GREEN)

- Write just enough code to pass.
- Don't optimize prematurely.
- Run the tests and verify they pass.

### Step 4: Refactor

- Extract constants and improve names where useful.
- Remove duplication.
- Re-run the tests.

### Step 5: Check project-defined coverage goals

Apply a target only when the project documents one or the user asks. Don't invent
a threshold or expand scope just to meet a generic percentage.

## Test Types to Include

- **Unit Tests**: Individual functions
- **Edge Cases**: Empty, null, max values, boundaries
- **Error Conditions**: Invalid inputs, network failures
- **Integration Tests**: API endpoints, database operations

---

Prefer a red-green-refactor cycle for behavior changes when it fits the project and request. For trivial changes, unavailable test seams, or user-directed alternatives, explain any deviation briefly and verify proportionately.
