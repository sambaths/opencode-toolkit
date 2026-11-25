import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { ROLE_TIERS } from '../../lib/model-profile.mjs';

const bundle = fileURLToPath(new URL('../', import.meta.url));
const repository = fileURLToPath(new URL('../../', import.meta.url));
const read = name => readFileSync(path.join(bundle, name), 'utf8');
const instructions = read('instructions/INSTRUCTIONS.md');

test('canonical plan-first contract defines the plan and its handoff', () => {
  const section = instructions.split(/^## /m).find(part => part.startsWith('Plan-first handoff'));
  assert.ok(section, 'missing canonical Plan-first handoff section');
  for (const phrase of [
    'thinking tier',
    'goal, scope, and non-goals',
    'affected files and seams',
    'ordered steps and dependencies',
    'acceptance criteria with stable IDs',
    'baseline and verification commands',
    'risks, assumptions',
    'repair limit',
    'same plan identity, revision, and content',
    'conversational',
  ]) assert.ok(section.includes(phrase), phrase);
  assert.match(section, /read-only discovery/i);
  assert.match(section, /short plan/i);
  assert.match(section, /every product, code, and test change/i);
  assert.match(section, /rather than an ID alone/i);
  assert.match(section, /managers? normally author/i);
  assert.match(section, /derive expected results independently/i);
  assert.match(section, /plan can be wrong/i);
});

test('every implementation entrypoint points to the canonical contract', () => {
  const implementationFiles = [
    'agents/developer.md',
    'agents/senior-developer.md',
    'agents/frontend-designer.md',
    'agents/systems-engineer.md',
    'agents/performance-engineer.md',
    'agents/toolsmith.md',
    'prompts/agents/security-reviewer.txt',
    'prompts/agents/tdd-guide.txt',
    'prompts/agents/build-error-resolver.txt',
    'prompts/agents/cpp-build-resolver.txt',
    'prompts/agents/go-build-resolver.txt',
    'prompts/agents/java-build-resolver.txt',
    'prompts/agents/kotlin-build-resolver.txt',
    'prompts/agents/rust-build-resolver.txt',
    'prompts/agents/e2e-runner.txt',
    'prompts/agents/doc-updater.txt',
    'prompts/agents/refactor-cleaner.txt',
    'prompts/agents/harness-optimizer.txt',
    'prompts/agents/loop-operator.txt',
  ];
  for (const file of implementationFiles) {
    assert.match(read(file), /Plan-first handoff contract/, file);
  }
  for (const file of ['commands/orchestrate.md', 'commands/plan.md']) {
    assert.match(read(file), /Plan-first handoff contract/, file);
  }
  assert.match(instructions, /direct `build`/);
  for (const file of ['agents/manager.md', 'commands/orchestrate.md']) {
    assert.match(read(file), /implementers and testers/, file);
    assert.match(read(file), /same plan identity, revision, and content/, file);
  }
});

test('coding roles return missing plans instead of self-authoring replacements', () => {
  for (const file of ['agents/developer.md', 'agents/senior-developer.md']) {
    const content = read(file);
    assert.match(content, /missing, stale, or conflicting plan context/i, file);
    assert.match(content, /manager or planner/i, file);
    assert.match(content, /replacement plan|substituting a plan/i, file);
  }
});

test('review and testing roles check plan coverage from independent evidence', () => {
  for (const file of ['agents/reviewer.md', 'agents/adversarial-tester.md']) {
    const content = read(file);
    assert.match(content, /Plan-first handoff contract/, file);
    assert.match(content, /derive expected results independently/i, file);
    assert.match(content, /plan can be wrong/, file);
    assert.match(content, /compare plan, implementation, and tests/i, file);
    assert.match(content, /acceptance/, file);
    assert.match(content, /manager/, file);
  }
});

test('planning remains non-executing, conversational, and free of tracker gates', () => {
  const planCommand = read('commands/plan.md');
  assert.match(planCommand, /Return the plan and stop/);
  assert.match(planCommand, /Do not execute it unless the user separately asks/);
  for (const section of ['### Affected Files and Seams', '### Acceptance Criteria', '### Baseline and Verification', '### Repair Limit']) {
    assert.ok(planCommand.includes(section), section);
  }
  assert.match(read('agents/planner.md'), /Planning means return a plan and stop/);
  assert.match(instructions, /Save one only when the user or project asks/i);
  assert.match(instructions, /[Nn]o tracker, file, or per-step human approval/i);
});

test('planning and review stay on the thinking tier while implementation stays coding', () => {
  for (const role of ['manager', 'planner', 'reviewer', 'adversarial-tester']) {
    assert.equal(ROLE_TIERS[role], 'thinking', role);
  }
  for (const role of ['build', 'developer', 'senior-developer', 'tdd-guide', 'build-error-resolver', 'go-build-resolver']) {
    assert.equal(ROLE_TIERS[role], 'coding', role);
  }
});

test('README states the direct-build plan requirement and prompt-level limitation', () => {
  const readme = readFileSync(path.join(repository, 'README.md'), 'utf8');
  assert.match(readme, /Plan-first handoff/);
  assert.match(readme, /direct `build`/i);
  assert.match(readme, /prompt-level/i);
  assert.match(readme, /not a plugin, runtime gate, or automatic enforcement/i);
});
