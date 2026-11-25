import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, rmSync, readdirSync, cpSync, chmodSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { install, mergeConfig, assertSafePath, parseConfig } from '../lib/install.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'bin/install.mjs');
function fixture(t) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'opencode-installer-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return base;
}
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const read = file => readFileSync(file, 'utf8');
const configuration = project => JSON.parse(read(path.join(project, '.opencode/opencode.json')));
const DEFAULT_PROFILE = { thinking: 'google/gemini-4-hydrogen', coding: 'opencode/deepseek-v4.1-flash' };
// Independent expected classification: one tier for every shipped role.
const SHIPPED_TIERS = {
  'adversarial-tester': 'thinking', architect: 'thinking', developer: 'coding', 'frontend-designer': 'coding',
  manager: 'thinking', moderator: 'thinking', notetaker: 'thinking', 'performance-engineer': 'thinking',
  planner: 'thinking', researcher: 'thinking', 'reverse-engineer': 'thinking', reviewer: 'thinking',
  'senior-developer': 'coding', 'systems-engineer': 'coding', toolsmith: 'thinking', 'tracker-sync': 'thinking',
  build: 'coding', 'code-reviewer': 'thinking', 'security-reviewer': 'thinking', 'tdd-guide': 'coding',
  'build-error-resolver': 'coding', 'e2e-runner': 'coding', 'doc-updater': 'coding', 'refactor-cleaner': 'coding',
  'go-reviewer': 'thinking', 'go-build-resolver': 'coding', 'database-reviewer': 'thinking', 'cpp-reviewer': 'thinking',
  'cpp-build-resolver': 'coding', 'docs-lookup': 'thinking', 'harness-optimizer': 'coding', 'java-reviewer': 'thinking',
  'java-build-resolver': 'coding', 'kotlin-reviewer': 'thinking', 'kotlin-build-resolver': 'coding',
  'loop-operator': 'coding', 'php-reviewer': 'thinking', 'python-reviewer': 'thinking', 'rust-reviewer': 'thinking',
  'rust-build-resolver': 'coding', plan: 'thinking', general: 'thinking', explore: 'thinking',
};
const bundleConfig = () => JSON.parse(read(path.join(root, 'bundle/opencode.json')));
const customAgentNames = () => readdirSync(path.join(root, 'bundle/agents')).filter(file => file.endsWith('.md')).map(file => file.slice(0, -3));
const retainedAgentNames = () => Object.keys(bundleConfig().agents ?? {});
const frontmatter = content => /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1] ?? '';
const frontmatterModel = content => {
  const match = /^model:\s*(.+?)\s*$/m.exec(frontmatter(content));
  return match?.[1].replace(/^['"]|['"]$/g, '');
};
const renderedAgent = (name, models = DEFAULT_PROFILE) => read(path.join(root, 'bundle/agents', `${name}.md`))
  .replace(/^---\r?\n/, `---\nmodel: '${models[SHIPPED_TIERS[name]]}'\n`);
const anyConfiguration = project => {
  const json = path.join(project, '.opencode/opencode.json');
  const jsonc = path.join(project, '.opencode/opencode.jsonc');
  const file = existsSync(json) ? json : jsonc;
  return parseConfig(read(file), file);
};
function assertAssignments(project, profile) {
  const config = anyConfiguration(project);
  for (const name of customAgentNames()) {
    assert.equal(frontmatterModel(read(path.join(project, '.opencode/agents', `${name}.md`))), profile[SHIPPED_TIERS[name]], name);
  }
  for (const name of retainedAgentNames()) assert.equal(config.agents[name].model, profile[SHIPPED_TIERS[name]], name);
  for (const name of ['plan', 'general', 'explore']) assert.equal(config.agents[name].model, profile[SHIPPED_TIERS[name]], name);
}

test('fresh project installs agents, config, commands, and required prompt files', t => {
  const project = fixture(t);
  const result = run('--project', project);
  assert.equal(result.status, 0, result.stderr);
  const config = configuration(project);
  assert.equal(config.default_agent, 'manager');
  assert.ok(existsSync(path.join(project, '.opencode/agents/manager.md')));
  assert.ok(existsSync(path.join(project, '.opencode/commands/council.md')));
  for (const ref of [...JSON.stringify(config).matchAll(/\{file:([^}]+)\}/g)]) {
    assert.ok(existsSync(path.join(project, '.opencode', ref[1])), ref[1]);
  }
  assert.equal(config.mcp, undefined);
});

test('dry-run creates nothing, including the target directory', t => {
  const parent = fixture(t); const project = path.join(parent, 'not-created');
  const result = run('--project', project, '--dry-run');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY RUN/);
  assert.equal(existsSync(project), false);
});

test('reinstallation is byte-for-byte idempotent', t => {
  const project = fixture(t);
  assert.equal(run('--project', project).status, 0);
  const config = read(path.join(project, '.opencode/opencode.json'));
  const manifest = read(path.join(project, '.opencode/toolkit-manifest.json'));
  assert.equal(run('--project', project).status, 0);
  assert.equal(read(path.join(project, '.opencode/opencode.json')), config);
  assert.equal(read(path.join(project, '.opencode/toolkit-manifest.json')), manifest);
});

test('preserves unrelated JSON settings and local instructions', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify({ model: 'local/model', default_agent: 'build', instructions: ['LOCAL.md'], providers: { local: {} } }));
  assert.equal(run('--project', project).status, 0);
  const config = configuration(project);
  assert.equal(config.model, 'local/model'); assert.equal(config.default_agent, 'build');
  assert.deepEqual(config.providers, { local: {} });
  assert.ok(config.instructions.includes('LOCAL.md'));
});

test('supports JSONC and preserves unrelated comments', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  const config = path.join(project, '.opencode/opencode.jsonc');
  writeFileSync(config, '{\n // keep this comment\n "model": "local/model",\n}\n');
  const result = run('--project', project);
  assert.equal(result.status, 0, result.stderr);
  assert.match(read(config), /keep this comment/);
  assert.equal(existsSync(path.join(project, '.opencode/opencode.json')), false);
});

test('replaces matching unmanaged files and backs up their previous contents', t => {
  const project = fixture(t); const dir = path.join(project, '.opencode/agents'); mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manager.md'), 'my manager');
  writeFileSync(path.join(dir, 'my-helper.md'), 'keep this role');
  const result = install({ project });
  assert.equal(read(path.join(dir, 'manager.md')), renderedAgent('manager'));
  assert.equal(read(path.join(dir, 'my-helper.md')), 'keep this role');
  assert.equal(read(path.join(result.backupDirectory, '.opencode/agents/manager.md')), 'my manager');
  assert.equal(read(path.join(project, '.opencode/.toolkit-backups/.gitignore')), '*\n!.gitignore\n');
});

test('updates replace locally modified managed files with a recoverable backup', t => {
  const project = fixture(t); assert.equal(run('--project', project).status, 0);
  const file = path.join(project, '.opencode/agents/manager.md'); writeFileSync(file, 'customized');
  const result = install({ project });
  assert.equal(read(file), renderedAgent('manager'));
  assert.equal(read(path.join(result.backupDirectory, '.opencode/agents/manager.md')), 'customized');
});

test('preserves stricter matching permission rules and unrelated specific rules', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  const file = path.join(project, '.opencode/opencode.json');
  const localRule = { action: 'shell', resource: 'custom-deploy *', effect: 'deny' };
  const original = JSON.stringify({ permissions: [{ action: 'shell', resource: '*', effect: 'deny' }, localRule] });
  writeFileSync(file, original);
  const result = install({ project });
  const rules = configuration(project).permissions;
  assert.deepEqual(rules.filter(r => r.action === 'shell' && r.resource === '*'), [{ action: 'shell', resource: '*', effect: 'deny' }]);
  assert.deepEqual(rules.at(-1), localRule);
  assert.equal(read(path.join(result.backupDirectory, '.opencode/opencode.json')), original);
});

test('invalid JSON, ambiguous configs and invalid arguments fail safely', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  writeFileSync(path.join(project, '.opencode/opencode.json'), '{ broken');
  assert.notEqual(run('--project', project).status, 0);
  writeFileSync(path.join(project, '.opencode/opencode.jsonc'), '{}');
  assert.match(run('--project', project).stderr, /both|ambiguous/i);
  assert.notEqual(run('--force').status, 0);
  assert.notEqual(run('--project').status, 0);
  assert.equal(run('--help').status, 0);
});

test('refuses symlinked installation paths', { skip: process.platform === 'win32' }, t => {
  const parent = fixture(t); const project = path.join(parent, 'project'); const external = path.join(parent, 'external');
  mkdirSync(project); mkdirSync(external); symlinkSync(external, path.join(project, '.opencode'), 'dir');
  const result = run('--project', project);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /symlink/i);
  assert.deepEqual(readdirSync(external), []);
});

test('package export has no project history, plugins, credentials or machine-specific settings', () => {
  const config = JSON.parse(read(path.join(root, 'bundle/opencode.json')));
  assert.equal(config.mcp, undefined); assert.equal(config.plugins, undefined);
  for (const file of ['AGENTS.md', 'plans', 'node_modules', 'plugins', '.env', 'envkeys']) {
    assert.equal(existsSync(path.join(root, 'bundle', file)), false, file);
  }
  assert.doesNotMatch(JSON.stringify(config), /disciple|100\.126|\/home\//);
});

test('managed updates replace pristine files and old rules without duplicate matchers', t => {
  const project = fixture(t); const parent = fixture(t); const bundle = path.join(parent, 'bundle');
  cpSync(path.join(root, 'bundle'), bundle, { recursive: true });
  install({ project, bundle });
  const file = path.join(bundle, 'agents/manager.md'); writeFileSync(file, `${read(file)}\nUpdated guidance.\n`);
  const configFile = path.join(bundle, 'opencode.json'); const incoming = JSON.parse(read(configFile));
  incoming.permissions.find(rule => rule.action === 'shell' && rule.resource === 'git push *').effect = 'deny';
  writeFileSync(configFile, JSON.stringify(incoming));
  install({ project, bundle });
  assert.match(read(path.join(project, '.opencode/agents/manager.md')), /Updated guidance/);
  const rules = configuration(project).permissions.filter(rule => rule.action === 'shell' && rule.resource === 'git push *');
  assert.equal(rules.length, 1); assert.equal(rules[0].effect, 'deny');
});

test('replaces JSON and legacy Markdown definitions while retaining unrelated definitions', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  const file = path.join(project, '.opencode/opencode.json');
  writeFileSync(file, JSON.stringify({ agents: { manager: { mode: 'primary' }, 'local-helper': { mode: 'subagent' } }, commands: { plan: { template: 'old plan' }, local: { template: 'keep' } } }));
  mkdirSync(path.join(project, '.opencode/command'));
  writeFileSync(path.join(project, '.opencode/command/plan.md'), 'local plan');
  const result = install({ project });
  assert.equal(configuration(project).agents.manager, undefined);
  assert.deepEqual(configuration(project).agents['local-helper'], { mode: 'subagent' });
  assert.equal(configuration(project).commands.plan, undefined);
  assert.deepEqual(configuration(project).commands.local, { template: 'keep' });
  assert.equal(existsSync(path.join(project, '.opencode/command/plan.md')), false);
  assert.equal(read(path.join(result.backupDirectory, '.opencode/command/plan.md')), 'local plan');
});

test('parsing, path and schema boundary validation rejects invalid inputs', t => {
  const project = fixture(t);
  assert.throws(() => assertSafePath(project, path.dirname(project)), /escapes/);
  assert.throws(() => parseConfig('null', 'test'), /Invalid/);
  const incoming = { agents: {}, experimental: {}, instructions: [], permissions: [] };
  for (const existing of [{ agents: [] }, { experimental: 1 }, { instructions: {} }, { permissions: {} }]) {
    assert.throws(() => mergeConfig(existing, incoming), /Invalid/);
  }
  assert.throws(() => mergeConfig({ permissions: [null] }, { ...incoming, permissions: [{ action: 'shell', resource: '*', effect: 'allow' }] }), /Invalid/);
  assert.equal(mergeConfig({ experimental: { subagent_depth: 3, todo: true } }, { ...incoming, experimental: { subagent_depth: 1 } }).experimental.subagent_depth, 1);
  mkdirSync(path.join(project, '.opencode')); writeFileSync(path.join(project, '.opencode/toolkit-manifest.json'), '{"format":99}');
  assert.match(run('--project', project).stderr, /Unsupported/);
});

test('unrelated edits to existing JSONC maps survive updates', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  const file = path.join(project, '.opencode/opencode.jsonc');
  writeFileSync(file, '{"agents": {\n // preserve local role\n "local-helper": {"mode":"subagent"}\n}, "experimental": {"todo":true}}');
  install({ project });
  assert.match(read(file), /preserve local role/);
  assert.match(read(file), /local-helper/);
  assert.equal(run('--project', project).status, 0);
});

test('preserves root config defaults and replaces matching root definitions with backups', t => {
  const project = fixture(t); const file = path.join(project, 'opencode.json');
  const original = JSON.stringify({ default_agent: 'build', model: 'local/model' });
  writeFileSync(file, original);
  assert.equal(run('--project', project).status, 0);
  assert.equal(configuration(project).default_agent, 'build');
  assert.equal(read(file), original);
  const conflict = fixture(t);
  writeFileSync(path.join(conflict, 'opencode.json'), JSON.stringify({ agents: { manager: { mode: 'primary' } } }));
  const result = install({ project: conflict });
  assert.equal(JSON.parse(read(path.join(conflict, 'opencode.json'))).agents.manager, undefined);
  assert.ok(existsSync(path.join(conflict, '.opencode/agents/manager.md')));
  assert.equal(JSON.parse(read(path.join(result.backupDirectory, 'opencode.json'))).agents.manager.mode, 'primary');
});

test('adopts an identical pre-existing shared policy without false conflicts', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  cpSync(path.join(root, 'bundle/opencode.json'), path.join(project, '.opencode/opencode.json'));
  const result = run('--project', project);
  assert.equal(result.status, 0, result.stderr);
});

test('dry-run lists replacements/removals without changing files or creating backups', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode/command'), { recursive: true });
  const file = path.join(project, '.opencode/command/plan.md'); writeFileSync(file, 'old plan');
  const result = install({ project, dryRun: true });
  assert.equal(read(file), 'old plan');
  assert.equal(existsSync(path.join(project, '.opencode/.toolkit-backups')), false);
  assert.ok(result.changes.includes('.opencode/command/plan.md'));
  assert.equal(result.backupDirectory, null);
});

test('removes conflicting Markdown for retained JSON agents, with a backup', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode/agents'), { recursive: true });
  const file = path.join(project, '.opencode/agents/tdd-guide.md'); writeFileSync(file, 'old tdd');
  const result = install({ project });
  assert.equal(existsSync(file), false);
  assert.equal(read(path.join(result.backupDirectory, '.opencode/agents/tdd-guide.md')), 'old tdd');
});

test('preserves unrelated root permission effects, and repeated installs need no further backups', t => {
  const project = fixture(t); const file = path.join(project, 'opencode.json');
  const local = { action: 'shell', resource: 'custom-deploy *', effect: 'deny' };
  writeFileSync(file, JSON.stringify({ permissions: [{ action: 'shell', resource: '*', effect: 'deny' }, local] }));
  install({ project });
  assert.deepEqual(JSON.parse(read(file)).permissions, [{ action: 'shell', resource: '*', effect: 'deny' }, local]);
  assert.deepEqual(configuration(project).permissions.at(-1), local);
  const again = install({ project });
  assert.deepEqual(again.changes, []); assert.equal(again.backupDirectory, null);
});

test('replacement preserves restrictive config permissions and protects backups', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  const file = path.join(project, '.opencode/opencode.json'); writeFileSync(file, '{}'); chmodSync(file, 0o600);
  const result = install({ project });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(path.join(result.backupDirectory, '.opencode/opencode.json')).mode & 0o777, 0o600);
  assert.equal(statSync(result.backupDirectory).mode & 0o777, 0o700);
});

test('symlinked backup directories abort before replacing files', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t); const external = fixture(t); mkdirSync(path.join(project, '.opencode/agents'), { recursive: true });
  symlinkSync(external, path.join(project, '.opencode/.toolkit-backups'), 'dir');
  const file = path.join(project, '.opencode/agents/manager.md'); writeFileSync(file, 'keep until backup succeeds');
  assert.throws(() => install({ project }), /symlink/);
  assert.equal(read(file), 'keep until backup succeeds'); assert.deepEqual(readdirSync(external), []);
});

// Representative last-match checks, not an OpenCode policy evaluator.
const shellDecision = (rules, command) => rules.reduce((effect, rule) => {
  const pattern = new RegExp(`^${rule.resource.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return rule.action === 'shell' && pattern.test(command) ? rule.effect : effect;
}, undefined);

test('preserves overlapping ordered rules including repeated matchers across root and local', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  const deny = { action: 'shell', resource: '*', effect: 'deny' };
  const allow = { action: 'shell', resource: 'git *', effect: 'allow' };
  const rules = [deny, allow, deny];
  writeFileSync(path.join(project, 'opencode.json'), JSON.stringify({ permissions: rules }));
  writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify({ permissions: [allow, deny] }));
  install({ project });
  for (const command of ['git status', 'git push origin main', 'cat README.md']) {
    assert.equal(shellDecision(configuration(project).permissions, command), 'deny');
  }
  assert.deepEqual(configuration(project).permissions.slice(-5), [...rules, allow, deny]);
  assert.deepEqual(install({ project }).changes, []);
  // An independently edited local rule equal to a root rule is not stripped.
  const file = path.join(project, '.opencode/opencode.json'); const config = configuration(project);
  config.permissions.push(allow, deny); writeFileSync(file, JSON.stringify(config));
  install({ project });
  assert.equal(shellDecision(configuration(project).permissions, 'git push origin main'), 'deny');
  assert.deepEqual(install({ project }).changes, []);
});

test('exact matcher effects never weaken deny to ask or ask to allow', () => {
  const incoming = { agents: {}, experimental: {}, instructions: [], permissions: [{ action: 'shell', resource: '*', effect: 'allow' }] };
  for (const effect of ['ask', 'deny']) {
    const rules = [{ action: 'shell', resource: '*', effect }];
    assert.equal(mergeConfig({ permissions: rules }, incoming).permissions[0].effect, effect);
  }
  incoming.permissions[0].effect = 'ask';
  assert.equal(mergeConfig({ permissions: [{ action: 'shell', resource: '*', effect: 'deny' }] }, incoming).permissions[0].effect, 'deny');
});

test('an existing matching broad allow does not move after and erase incoming approval safeguards', t => {
  const project = fixture(t);
  writeFileSync(path.join(project, 'opencode.json'), JSON.stringify({ permissions: [{ action: 'shell', resource: '*', effect: 'allow' }] }));
  install({ project });
  assert.equal(shellDecision(configuration(project).permissions, 'git push origin main'), 'ask');
  assert.equal(shellDecision(configuration(project).permissions, 'git status'), 'allow');
  assert.deepEqual(install({ project }).changes, []);
});

test('conflicting restrictive agent migrations fail before writes, for root/local JSON and Markdown', t => {
  const definition = { permissions: [{ action: 'shell', resource: '*', effect: 'deny' }] };
  for (const location of ['opencode.json', '.opencode/opencode.json', '.opencode/agents/manager.md', '.opencode/agent/build.md']) {
    const project = fixture(t); const file = path.join(project, location); mkdirSync(path.dirname(file), { recursive: true });
    const original = location.endsWith('.md') ? '---\npermissions:\n  - action: shell\n    resource: "*"\n    effect: deny\n---\ncustom role\n' : JSON.stringify({ agents: { manager: definition } });
    writeFileSync(file, original);
    assert.throws(() => install({ project }), /Restrictive agent permission migration/);
    assert.equal(read(file), original);
    assert.equal(existsSync(path.join(project, '.opencode/toolkit-manifest.json')), false);
    assert.equal(existsSync(path.join(project, '.opencode/.toolkit-backups')), false);
  }
});

test('skill collision fails before writes; managed skills update with backups; unrelated skills/state survive', t => {
  const source = fixture(t); const bundle = path.join(source, 'bundle');
  cpSync(path.join(root, 'bundle'), bundle, { recursive: true });
  const relative = 'skills/toolkit-fixture/SKILL.md';
  mkdirSync(path.dirname(path.join(bundle, relative)), { recursive: true });
  writeFileSync(path.join(bundle, relative), '---\nname: Toolkit Fixture\ndescription: Test fixture\n---\nSafe source');
  const project = fixture(t); const collision = path.join(project, '.opencode', relative);
  mkdirSync(path.dirname(collision), { recursive: true }); writeFileSync(collision, 'unrelated content with same ID');
  assert.throws(() => install({ project, bundle }), /Unmanaged skill collision/);
  assert.equal(read(collision), 'unrelated content with same ID');
  assert.equal(existsSync(path.join(project, '.opencode/opencode.json')), false);
  assert.equal(existsSync(path.join(project, '.opencode/.toolkit-backups')), false);
  rmSync(path.dirname(collision), { recursive: true });
  const unrelated = path.join(project, '.opencode/skills/my-skill/SKILL.md');
  mkdirSync(path.dirname(unrelated), { recursive: true }); writeFileSync(unrelated, 'keep my skill');
  mkdirSync(path.join(project, '.toolkit-state')); writeFileSync(path.join(project, '.toolkit-state/state.json'), 'do not touch runtime state');
  install({ project, bundle });
  writeFileSync(collision, 'customized managed skill');
  const result = install({ project, bundle });
  assert.equal(read(path.join(result.backupDirectory, '.opencode', relative)), 'customized managed skill');
  assert.equal(read(unrelated), 'keep my skill');
  assert.equal(read(path.join(project, '.toolkit-state/state.json')), 'do not touch runtime state');
  assert.deepEqual(install({ project, bundle }).changes, []);
});

test('curated skills and local ledger ship in the package file allowlist and install', t => {
  const project = fixture(t); install({ project });
  const manifest = JSON.parse(read(path.join(root, 'package.json')));
  assert.ok(manifest.files.includes('bundle/'));
  for (const id of ['toolkit-grilling', 'toolkit-handoff', 'toolkit-questionnaire', 'toolkit-diagnosing-bugs', 'toolkit-tdd', 'toolkit-retro']) {
    assert.ok(existsSync(path.join(project, '.opencode/skills', id, 'SKILL.md')), id);
  }
  assert.ok(existsSync(path.join(project, '.opencode/tools/task-state.mjs')));
  assert.ok(existsSync(path.join(project, '.opencode/tools/task-state.md')));
  assert.ok(existsSync(path.join(project, '.opencode/skills/LICENSE.mattpocock.txt')));
  assert.ok(existsSync(path.join(project, '.opencode/skills/provenance.json')));
});

test('unmanaged skill metadata is not overwritten on first install', t => {
  const project = fixture(t); const file = path.join(project, '.opencode/skills/provenance.json');
  mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, 'unrelated metadata');
  assert.throws(() => install({ project }), /Unmanaged skill metadata collision/);
  assert.equal(read(file), 'unrelated metadata');
  assert.equal(existsSync(path.join(project, '.opencode/toolkit-manifest.json')), false);
});

test('fresh install assigns the default profile to every shipped role and built-in override', t => {
  const project = fixture(t);
  const result = run('--project', project);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Model profile: thinking google\/gemini-4-hydrogen; coding opencode\/deepseek-v4\.1-flash/);
  assert.match(result.stdout, /availability is not checked/i);
  assert.match(result.stdout, /No automatic failover/i);
  assertAssignments(project, DEFAULT_PROFILE);
  const manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
  assert.deepEqual(manifest.models, DEFAULT_PROFILE);
  const reviewer = path.join(project, '.opencode/agents/reviewer.md');
  assert.equal(manifest.files['agents/reviewer.md'], createHash('sha256').update(read(reviewer)).digest('hex'));
  for (const command of readdirSync(path.join(project, '.opencode/commands')).filter(file => file.endsWith('.md'))) {
    assert.doesNotMatch(frontmatter(read(path.join(project, '.opencode/commands', command))), /^model:/m, command);
  }
});

test('model flags override one tier, persist, and retain the other tier across updates', t => {
  const project = fixture(t);
  let result = run('--project', project, '--thinking-model', 'openai/gpt-6.1-sol#high');
  assert.equal(result.status, 0, result.stderr);
  assertAssignments(project, { thinking: 'openai/gpt-6.1-sol#high', coding: DEFAULT_PROFILE.coding });
  assert.deepEqual(JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json'))).models,
    { thinking: 'openai/gpt-6.1-sol#high', coding: DEFAULT_PROFILE.coding });
  result = run('--project', project, '--coding-model', 'vendor/coder#fast');
  assert.equal(result.status, 0, result.stderr);
  assertAssignments(project, { thinking: 'openai/gpt-6.1-sol#high', coding: 'vendor/coder#fast' });
  result = install({ project, thinkingModel: 'google/gemini-4-hydrogen' });
  assert.equal(result.project, project);
  assertAssignments(project, { thinking: DEFAULT_PROFILE.thinking, coding: 'vendor/coder#fast' });
});

test('legacy manifests without a model profile receive defaults on update', t => {
  const project = fixture(t);
  install({ project, thinkingModel: 'legacy/thinker', codingModel: 'legacy/coder' });
  const file = path.join(project, '.opencode/toolkit-manifest.json');
  const manifest = JSON.parse(read(file)); delete manifest.models;
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  const developer = path.join(project, '.opencode/agents/developer.md');
  const raw = read(path.join(root, 'bundle/agents/developer.md'));
  assert.equal(frontmatterModel(raw), undefined);
  writeFileSync(developer, raw);
  const result = install({ project });
  assert.deepEqual(result.models, DEFAULT_PROFILE);
  assert.deepEqual(JSON.parse(read(file)).models, DEFAULT_PROFILE);
  assertAssignments(project, DEFAULT_PROFILE);
});

test('invalid persisted profile selectors fail before generated writes', t => {
  for (const models of [
    { thinking: 'not-a-selector', coding: DEFAULT_PROFILE.coding },
    { thinking: DEFAULT_PROFILE.thinking, coding: '' },
    null,
  ]) {
    const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
    const file = path.join(project, '.opencode/toolkit-manifest.json');
    const original = `${JSON.stringify({ format: 1, models }, null, 2)}\n`;
    writeFileSync(file, original);
    assert.throws(() => install({ project }), /model/i);
    assert.equal(read(file), original);
    assert.equal(existsSync(path.join(project, '.opencode/opencode.json')), false);
    assert.equal(existsSync(path.join(project, '.opencode/agents')), false);
  }
});

test('invalid model selectors fail before creating or writing installation files', t => {
  const invalid = [
    ['--thinking-model', ''], ['--coding-model', 'google'], ['--coding-model', 'google/'],
    ['--thinking-model', '/model'], ['--thinking-model', 'google//model'],
    ['--thinking-model', 'google/model#'], ['--thinking-model', 'google/model#a#b'],
    ['--thinking-model', 'http://example/model'], ['--thinking-model', ' google/model'],
    ['--thinking-model'],
  ];
  for (const args of invalid) {
    const project = fixture(t);
    const result = run('--project', project, ...args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, /model/i, args.join(' '));
    assert.equal(existsSync(path.join(project, '.opencode')), false, args.join(' '));
  }
  const project = fixture(t);
  assert.throws(() => install({ project, codingModel: 42 }), /coding model/i);
  assert.equal(existsSync(path.join(project, '.opencode')), false);
});

test('dry-run reports the effective profile without writing', t => {
  const parent = fixture(t); const project = path.join(parent, 'missing');
  const result = run('--project', project, '--dry-run', '--coding-model', 'vendor/coder#fast');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /thinking google\/gemini-4-hydrogen/);
  assert.match(result.stdout, /coding vendor\/coder#fast/);
  assert.equal(existsSync(project), false);
  const api = install({ project, dryRun: true, thinkingModel: 'vendor/thinker' });
  assert.deepEqual(api.models, { thinking: 'vendor/thinker', coding: DEFAULT_PROFILE.coding });
  assert.equal(api.backupDirectory, null);
  assert.equal(existsSync(project), false);
});

test('model rendering is idempotent and switching profiles replaces generated assignments', t => {
  const project = fixture(t);
  install({ project, thinkingModel: 'openai/gpt-6.1-sol#high' });
  const config = read(path.join(project, '.opencode/opencode.json'));
  const manifest = read(path.join(project, '.opencode/toolkit-manifest.json'));
  assert.deepEqual(install({ project }).changes, []);
  assert.equal(read(path.join(project, '.opencode/opencode.json')), config);
  assert.equal(read(path.join(project, '.opencode/toolkit-manifest.json')), manifest);
  const switched = install({ project, codingModel: 'vendor/coder#fast' });
  assert.ok(switched.changes.includes('.opencode/agents/developer.md'));
  assert.ok(switched.changes.includes('.opencode/opencode.json'));
  assertAssignments(project, { thinking: 'openai/gpt-6.1-sol#high', coding: 'vendor/coder#fast' });
  assert.deepEqual(install({ project }).changes, []);
});

test('profile updates preserve unrelated JSONC, permissions, and built-in prompt settings', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  const file = path.join(project, '.opencode/opencode.jsonc');
  writeFileSync(file, `{
  // keep root model
  "model": "local/model",
  "default_agent": "build",
  "agents": {
    "plan": {
      // keep custom built-in prompt
      "system": "CUSTOM PLAN PROMPT",
      "permissions": [{"action": "shell", "resource": "custom *", "effect": "ask"}]
    },
    "local-helper": {"mode": "subagent"}
  },
  "permissions": [{"action": "shell", "resource": "custom-deploy *", "effect": "deny"}],
  "providers": {"local": {}}
}
`);
  install({ project, thinkingModel: 'vendor/thinker', codingModel: 'vendor/coder' });
  const content = read(file);
  assert.match(content, /keep root model/);
  assert.match(content, /keep custom built-in prompt/);
  const config = parseConfig(content, file);
  assert.equal(config.model, 'local/model');
  assert.equal(config.default_agent, 'build');
  assert.deepEqual(config.providers, { local: {} });
  assert.equal(config.agents.plan.system, 'CUSTOM PLAN PROMPT');
  assert.deepEqual(config.agents.plan.permissions, [{ action: 'shell', resource: 'custom *', effect: 'ask' }]);
  assert.equal(config.agents.plan.model, 'vendor/thinker');
  assert.deepEqual(config.agents['local-helper'], { mode: 'subagent' });
  assert.deepEqual(config.permissions.at(-1), { action: 'shell', resource: 'custom-deploy *', effect: 'deny' });
  assertAssignments(project, { thinking: 'vendor/thinker', coding: 'vendor/coder' });
});

test('explicit source export includes curated license/content but excludes unrelated skills and runtime state', t => {
  const project = fixture(t); install({ project });
  mkdirSync(path.join(project, '.opencode/skills/unrelated'), { recursive: true });
  writeFileSync(path.join(project, '.opencode/skills/unrelated/SKILL.md'), 'unrelated skill');
  mkdirSync(path.join(project, '.opencode/.toolkit-state'));
  writeFileSync(path.join(project, '.opencode/.toolkit-state/state.json'), 'private runtime history');
  const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
  cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
  const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(path.join(exporter, 'bundle/skills/toolkit-retro/SKILL.md')));
  assert.ok(existsSync(path.join(exporter, 'bundle/skills/LICENSE.mattpocock.txt')));
  assert.ok(existsSync(path.join(exporter, 'bundle/skills/provenance.json')));
  assert.equal(existsSync(path.join(exporter, 'bundle/skills/unrelated')), false);
  assert.equal(existsSync(path.join(exporter, 'bundle/.toolkit-state')), false);
});
