---
description: Fix build and TypeScript errors with minimal changes
agent: build-error-resolver
subagent: true
---

# Build Fix Command

Fix build and TypeScript errors with minimal changes: $ARGUMENTS

## Your Task

1. Run the project's type check, such as `npx tsc --noEmit`.
2. Collect all errors.
3. Fix them one at a time with minimal changes.
4. Verify each fix doesn't introduce new errors.
5. Run a final check.

## Approach

### Do

- Fix type errors with correct types.
- Add missing imports.
- Fix syntax errors.
- Keep changes minimal and preserve behavior.
- Re-run the type check after each change.

### Don't

- Refactor or add features.
- Change architecture or business logic.
- Use `any` unless it's truly necessary.
- Add `@ts-ignore` comments.

## Common Error Fixes

| Error | Fix |
| --- | --- |
| Type 'X' is not assignable to type 'Y' | Add the correct annotation. |
| Property 'X' does not exist | Fix the interface or property name. |
| Cannot find module 'X' | Fix the import path; install only with authorization. |
| Argument of type 'X' is not assignable | Cast or fix the function signature. |
| Object is possibly 'undefined' | Add a null check or optional chaining. |

## Verification Steps

Run the project's type check, build, and tests:

```bash
npx tsc --noEmit
npm run build
npm test
```

Use the actual configured commands. Focus on errors only: no refactoring,
improvements, or architectural changes. Get the build green with a minimal diff.
