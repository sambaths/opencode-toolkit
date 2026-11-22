---
description: Run verification loop to validate implementation
agent: build
---

# Verify Command

Run verification loop to validate the implementation: $ARGUMENTS

## Your Task

Execute comprehensive verification:

1. Discover the project's documented or configured type-check, lint, test, integration, build, and coverage commands.
2. Run only checks relevant to the changed scope, starting with focused checks and broadening as risk warrants.
3. Apply coverage targets only when the project or user defines them.

## Verification Checklist

### Code Quality
- [ ] Applicable language/type checks pass
- [ ] Applicable lint/style checks pass
- [ ] No unrelated cleanup or invented universal size limits

### Tests
- [ ] All tests passing
- [ ] Project-defined coverage target met, if applicable
- [ ] Edge cases covered
- [ ] Error conditions tested

### Security
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] No SQL injection risks
- [ ] No XSS vulnerabilities

### Build
- [ ] Build succeeds
- [ ] No warnings
- [ ] Bundle size acceptable

## Verification Report

### Summary
- Status: PASS / FAIL / PARTIAL
- Score: X/Y checks passed

### Details
| Check | Status | Notes |
|-------|--------|-------|
| Project check | PASS/FAIL/NOT RUN | [command and evidence] |

### Action Items
[If FAIL, list what needs to be fixed]

---

Do not commit, push, or open a PR unless separately requested.
