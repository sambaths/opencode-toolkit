---
description: Apply test-first development using the active project's test conventions
agent: tdd-guide
subagent: true
---

# TDD Command

Implement the following using strict test-driven development: $ARGUMENTS

## TDD Cycle (MANDATORY)

```
RED → GREEN → REFACTOR → REPEAT
```

1. **RED**: When the task calls for tests and the project has an appropriate test seam, write a failing test first.
2. **GREEN**: Write the minimum change that satisfies the test and request.
3. **REFACTOR**: Refactor only where useful, keeping relevant checks green.
4. **REPEAT**: Continue until the requested scope is complete.

## Your Task

### Step 1: Learn the project
- Identify the language, framework, test tools, conventions, and applicable instructions.
- Do not impose a language-specific scaffold.

### Step 2: Write Failing Tests (RED)
- Write tests that exercise the interface
- Include happy path, edge cases, and error conditions
- Run tests - verify they FAIL

### Step 3: Implement Minimal Code (GREEN)
- Write just enough code to make tests pass
- No premature optimization
- Run tests - verify they PASS

### Step 4: Refactor (IMPROVE)
- Extract constants, improve naming
- Remove duplication
- Run tests - verify they still PASS

### Step 5: Check project-defined coverage goals
- Apply only if the project has a documented coverage target or the user requested one.
- Do not invent thresholds or expand scope solely to meet a generic percentage.

## Test Types to Include

- **Unit Tests**: Individual functions
- **Edge Cases**: Empty, null, max values, boundaries
- **Error Conditions**: Invalid inputs, network failures
- **Integration Tests**: API endpoints, database operations

---

Prefer a red-green-refactor cycle for behavior changes when it fits the project and request. For trivial changes, unavailable test seams, or user-directed alternatives, explain any deviation briefly and verify proportionately.
