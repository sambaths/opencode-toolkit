---
description: Generate and run E2E tests with Playwright
agent: e2e-runner
subagent: true
---

# E2E Command

Generate and run end-to-end tests with Playwright: $ARGUMENTS

## Your Task

1. Analyze the user flow.
2. Create a Playwright test journey.
3. Run it and capture artifacts.
4. Report results with screenshots/videos when useful.

## Test Structure

```typescript
import { test, expect } from '@playwright/test'

test.describe('Feature: [Name]', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate, authenticate, and prepare state.
  })

  test('should [expected behavior]', async ({ page }) => {
    // Arrange.
    await page.click('[data-testid="button"]')
    await page.fill('[data-testid="input"]', 'value')

    // Act, then assert.
    await expect(page.locator('[data-testid="result"]')).toBeVisible()
  })

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await page.screenshot({ path: `test-results/${testInfo.title}.png` })
    }
  })
})
```

## Best Practices

### Selectors

- Prefer `data-testid` or semantic roles/labels.
- Avoid CSS classes when they're likely to change.

### Waits

- Use Playwright's auto-waiting and `expect()` assertions.
- Avoid `page.waitForTimeout()`.

### Isolation

- Keep each test independent.
- Clean up test data.
- Don't rely on test order.

## Artifacts to Capture

- Screenshots on failure
- Videos for debugging
- Traces for detailed analysis
- Network logs when relevant

## Test Categories

1. **Critical flows**: auth, core happy paths, payment/checkout.
2. **Edge cases**: network failures, invalid inputs, session expiry.
3. **Cross-browser**: configured browsers and mobile viewports.

## Report Format

```text
E2E Test Results
================
PASS: X
FAIL: Y
SKIPPED: Z

Failed Tests:
- test-name: Error message
  Screenshot: path/to/screenshot.png
  Video: path/to/video.webm
```

Run with `--headed` for debugging: `npx playwright test --headed`.
