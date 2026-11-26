// Persistent model profile shipped with the toolkit. These are selectors, not
// credentials or availability claims. Installation is offline and does not
// contact providers or configure failover.
export const DEFAULT_MODELS = Object.freeze({
  thinking: 'opencode/deepseek-v4.1-flash',
  coding: 'opencode/deepseek-v4.1-flash',
});

// Every shipped role has an explicit tier so a new role cannot silently inherit
// an unrelated model. Review/read/coordination work uses thinking; roles that
// edit code, tests, docs, builds, or runtime configuration use coding.
// Mixed roles: security-reviewer and database-reviewer are review-first
// (thinking); frontend-designer and systems-engineer are implementation-capable
// (coding). Managers should route remediation to a developer instead of relying
// on a silent mid-task model switch.
export const ROLE_TIERS = Object.freeze({
  'adversarial-tester': 'thinking',
  architect: 'thinking',
  developer: 'coding',
  'frontend-designer': 'coding',
  manager: 'thinking',
  moderator: 'thinking',
  notetaker: 'thinking',
  'performance-engineer': 'thinking',
  planner: 'thinking',
  researcher: 'thinking',
  'reverse-engineer': 'thinking',
  reviewer: 'thinking',
  'senior-developer': 'coding',
  'systems-engineer': 'coding',
  toolsmith: 'thinking',
  'tracker-sync': 'thinking',
  build: 'coding',
  'code-reviewer': 'thinking',
  'security-reviewer': 'thinking',
  'tdd-guide': 'coding',
  'build-error-resolver': 'coding',
  'e2e-runner': 'coding',
  'doc-updater': 'coding',
  'refactor-cleaner': 'coding',
  'go-reviewer': 'thinking',
  'go-build-resolver': 'coding',
  'database-reviewer': 'thinking',
  'cpp-reviewer': 'thinking',
  'cpp-build-resolver': 'coding',
  'docs-lookup': 'thinking',
  'harness-optimizer': 'coding',
  'java-reviewer': 'thinking',
  'java-build-resolver': 'coding',
  'kotlin-reviewer': 'thinking',
  'kotlin-build-resolver': 'coding',
  'loop-operator': 'coding',
  'php-reviewer': 'thinking',
  'python-reviewer': 'thinking',
  'rust-reviewer': 'thinking',
  'rust-build-resolver': 'coding',
  plan: 'thinking',
  general: 'thinking',
  explore: 'thinking',
});

export const BUILTIN_OVERRIDE_ROLES = Object.freeze(['plan', 'general', 'explore']);

// provider/model with an optional #variant. Model IDs may contain additional
// slash-separated segments (for example an aggregator prefix), but empty
// segments, whitespace, malformed variants, and URLs are rejected.
const MODEL_SELECTOR = /^[A-Za-z0-9][A-Za-z0-9._-]*\/(?:[A-Za-z0-9][A-Za-z0-9._:@-]*\/)*[A-Za-z0-9][A-Za-z0-9._:@-]*(?:#[A-Za-z0-9][A-Za-z0-9._-]*)?$/;

export function assertModelSelector(value, label = 'model') {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || !MODEL_SELECTOR.test(value)) {
    throw new Error(`Invalid ${label} selector: expected provider/model with optional #variant`);
  }
  return value;
}
