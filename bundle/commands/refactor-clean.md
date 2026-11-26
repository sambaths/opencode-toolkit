---
description: Remove dead code and consolidate duplicates
agent: refactor-cleaner
subagent: true
---

# Refactor Clean Command

Analyze and clean up the codebase: $ARGUMENTS

## Your Task

1. Detect dead code with the project's analysis tools.
2. Find duplicates and consolidation opportunities.
3. Remove unused code safely, with the project's required documentation.
4. Verify nothing broke.

## Detection Phase

Use existing tools where configured:

```bash
npx knip
npx depcheck
npx ts-prune
```

Don't install a new analyzer without authorization. Also check for unused
functions, variables, imports, commented-out or unreachable code, and unused CSS
classes.

## Removal Phase

Before removing anything:

1. Search for usage and references.
2. Check whether exports are used externally.
3. Verify no test depends on it.
4. Follow the project's commit-message rules when a commit is authorized.

Remove in a safe order: unused imports, private functions, exported functions,
types/interfaces, then files. Keep each step verifiable.

## Consolidation Phase

Look for similar functions, copy-pasted blocks, and repeated patterns. Prefer the
project's existing conventions: a utility function, shared constants, a base
class, or higher-order functions where each fits.

## Verification

Run the active project's build, tests, lint, and smoke checks. Don't assume
`npm run build`, `npm test`, or `npm run lint` exists.

## Report Format

```text
Dead Code Analysis
==================

Removed:
- file.ts: functionName (unused export)
- utils.ts: helperFunction (no callers)

Consolidated:
- formatDate() and formatDateTime() → dateUtils.format()

Remaining (manual review needed):
- oldComponent.tsx: potentially unused, verify with team
```

Always verify before removing. When in doubt, ask or add `// TODO: verify usage`.
