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
    'same plan identity and revision',
    'does not mean identical content',
    'scoped excerpt',
    'conversational',
  ]) assert.ok(section.includes(phrase), phrase);
  assert.match(section, /read-only discovery/i);
  assert.match(section, /short plan/i);
  assert.match(section, /every product, code, and test change/i);
  assert.match(section, /an ID alone is insufficient|rather than an ID alone/i);
  assert.match(section, /complete relevant cross-step scope/i);
  assert.match(section, /persistent plan files/i);
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
    assert.match(read(file), /same plan identity and revision/, file);
    assert.match(read(file), /scoped excerpt/, file);
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

test('shared discovery and verification carry context, evidence, and reporting discipline', () => {
  const discovery = instructions.split(/^## /m).find(part => part.startsWith('Learn the active project'));
  assert.ok(discovery, 'missing canonical project-discovery section');
  for (const phrase of [
    'grep/glob',
    'read enough surrounding context once',
    'Avoid repeated discovery',
    'exact excerpt',
    'exit status',
    'evidence path',
    'Never pipe/filter',
    'appear to pass',
    'skill bodies/reference',
    'redundant reloads',
    'hard quotas',
    'context brief',
  ]) assert.ok(discovery.includes(phrase), phrase);

  const verification = instructions.split(/^## /m).find(part => part.startsWith('Project conventions and verification'));
  assert.ok(verification, 'missing canonical verification section');
  for (const phrase of [
    'tree/revision',
    'environment',
    'invalidate',
    'external-state',
    'nondeterminism',
    'Avoid unchanged duplicates',
    'delivered state',
    'focused checks first',
    'broader suites once',
    'blanket-skip',
    'repeated failure',
    'two-repair',
    'bounded provider retries',
    'Report contract',
    'Changed, Checks, Gaps',
    'omitting empty fields',
    'status updates are deltas',
  ]) assert.ok(verification.includes(phrase), phrase);
  assert.ok(read('agents/reviewer.md').includes('file:line'));
});

test('manager-only delegation details stay in the manager role', () => {
  const manager = read('agents/manager.md');
  for (const phrase of [
    'Routine planning and discovery stay direct',
    'delta handoff',
    'fresh session',
    'full scoped packet',
    'pending writers',
    'overlapping writes',
    'Never use an implementer as independent reviewer',
  ]) assert.ok(manager.includes(phrase), phrase);

  const boundaries = instructions.split(/^## /m).find(part => part.startsWith('Shared tools and role boundaries'));
  assert.match(boundaries, /independent review\/testing comes from another agent, never the implementer/);
  assert.doesNotMatch(instructions, /delta handoff|pending writers|overlapping writes/i);
});

test('manager points to optional local context tools without mandatory overhead', () => {
  const manager = read('agents/manager.md');
  for (const phrase of [
    '.opencode/tools/context-tools.md',
    '.opencode/tools/rtk.md',
    '.opencode/tools/rtk-install.md',
    'on demand only',
    'existing plan packet',
    'read-only',
    'omission status',
    'never auto-rewrite consequential commands',
    'bypass approval',
    'older install',
    'report the limitation',
  ]) assert.ok(manager.includes(phrase), phrase);
  assert.doesNotMatch(manager, /bundle\/tools\/context-tools|bundle\/tools\/rtk/);
  assert.doesNotMatch(instructions, /context-tools|rtk\.md|rtk-install/);
});

test('concise output defaults preserve evidence and role-specific completeness', () => {
  const verification = instructions.split(/^## /m).find(part => part.startsWith('Project conventions and verification'));
  for (const phrase of [
    'concise',
    'grammatical',
    'filler',
    'unchanged context',
    'I will now',
    'missing-evidence',
    'no fixed word limit',
    'suppression of internal reasoning',
    'status updates are deltas',
  ]) assert.ok(verification.includes(phrase), phrase);

  assert.ok(read('agents/manager.md').includes('delta/progress'));
  assert.ok(read('agents/planner.md').includes('every acceptance, constraint, risk, and dependency'));

  const developer = read('agents/developer.md');
  for (const phrase of ['Changed/Checks/Gaps/Next', 'unverified']) assert.ok(developer.includes(phrase), phrase);

  const reviewer = read('agents/reviewer.md');
  for (const phrase of ['findings first', 'expected versus actual']) assert.ok(reviewer.includes(phrase), phrase);

  const readme = readFileSync(path.join(repository, 'README.md'), 'utf8');
  assert.match(readme, /concise-agent defaults/i);
  assert.match(readme, /visible output/i);
  assert.match(readme, /not guaranteed/i);
  assert.match(readme, /internal reasoning or cost savings/i);
  assert.match(readme, /full\s+Caveman skill/i);
});

test('no contradictory full-plan-content requirement remains', () => {
  const forbidden = /same plan identity, revision, and content/i;
  assert.doesNotMatch(instructions, forbidden);
  for (const file of ['agents/manager.md', 'commands/orchestrate.md', 'commands/plan.md']) {
    assert.doesNotMatch(read(file), forbidden, file);
  }
  const readme = readFileSync(path.join(repository, 'README.md'), 'utf8');
  assert.match(readme, /Same plan does not mean\s+identical text/i);
});

test('README documents token-efficiency evidence and optional tools without overclaiming', () => {
  const readme = readFileSync(path.join(repository, 'README.md'), 'utf8');
  for (const link of [
    'https://opencode.ai/docs/compaction#limits',
    'https://opencode.ai/docs/compaction#background-compaction',
    'https://opencode.ai/docs/skills#loading',
    'https://opencode.ai/docs/models#prompt-caching',
    'https://ai.google.dev/gemini-api/docs/caching',
    'https://api-docs.deepseek.com/guides/kv_cache',
    'https://opencode.ai/docs/config#output',
    'https://opencode.ai/docs/warming',
    'https://opencode.ai/docs/mcp-servers',
    'bundle/tools/context-tools.md',
    'bundle/tools/rtk.md',
    'bundle/tools/rtk-install.md',
  ]) assert.ok(readme.includes(link), link);
  assert.match(readme, /UTF-8\s+source bytes, not tokens/i);
  assert.match(readme, /reports what it omits/i);
  assert.match(readme, /not a plan author, quality\s+enforcer, or runtime controller/i);
  assert.match(readme, /same single `npx` installation auto-provisions the managed RTK OSS binary/i);
  assert.match(readme, /no extra steps/i);
  assert.match(readme, /safe optimization behavior is the default/i);
  assert.match(readme, /Automatic RTK\s+command rewriting, plugin installation, and `init` remain OFF/i);
  assert.match(readme, /permission discovery does not read\s+`\.opencode\/opencode\.json\(c\)`/i);
  assert.doesNotMatch(readme, /default-off manual commands|No automatic install, rewrite, plugin|optional, default-off/i);
  assert.match(readme, /native scoped search, Git, JSON, and LSP/i);
  assert.match(readme, /without adding mandatory dependencies or skills/i);
  assert.match(readme, /not a guarantee an agent runtime\s+follows/i);
  assert.match(readme, /Default model flags/i);
  assert.match(readme, /bin\/install\.mjs --project \/path\/to\/project --no-rtk/);
  assert.match(readme, /optional opt-out from the default managed RTK download/i);
  assert.match(readme, /Model profile resolution is offline/i);
  assert.match(readme, /pinned RTK\s+OSS asset over HTTPS/i);
  assert.match(readme, /intact managed install is\s+reused/i);
  assert.match(readme, /managed RTK OSS v1\.2\.1/);
  assert.match(readme, /\.opencode\/vendor\/rtk\//);
  assert.match(readme, /Supported targets:/i);
  assert.match(readme, /local ledger and context audit\/packer tools/);
  assert.match(readme, /managed RTK OSS binary/);
  assert.doesNotMatch(readme, /Installation is offline/i);
  assert.match(readme, /no percentage-savings or runtime-enforcement promise/i);
  assert.match(readme, /Caching does not reduce\s+logical tokens or context/i);
  assert.match(readme, /Gemini ignores OpenCode's `cache\.ttl`/);
  assert.match(readme, /does not\s+establish behavior or billing on this OpenCode route/i);
});
