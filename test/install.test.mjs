import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, rmSync, readdirSync, cpSync } from 'node:fs';
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
  assert.equal(read(path.join(dir, 'manager.md')), read(path.join(root, 'bundle/agents/manager.md')));
  assert.equal(read(path.join(dir, 'my-helper.md')), 'keep this role');
  assert.equal(read(path.join(result.backupDirectory, '.opencode/agents/manager.md')), 'my manager');
  assert.equal(read(path.join(project, '.opencode/.toolkit-backups/.gitignore')), '*\n!.gitignore\n');
});

test('updates replace locally modified managed files with a recoverable backup', t => {
  const project = fixture(t); assert.equal(run('--project', project).status, 0);
  const file = path.join(project, '.opencode/agents/manager.md'); writeFileSync(file, 'customized');
  const result = install({ project });
  assert.equal(read(file), read(path.join(root, 'bundle/agents/manager.md')));
  assert.equal(read(path.join(result.backupDirectory, '.opencode/agents/manager.md')), 'customized');
});

test('replaces matching permission rules and preserves unrelated specific rules', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  const file = path.join(project, '.opencode/opencode.json');
  const localRule = { action: 'shell', resource: 'custom-deploy *', effect: 'deny' };
  const original = JSON.stringify({ permissions: [{ action: 'shell', resource: '*', effect: 'deny' }, localRule] });
  writeFileSync(file, original);
  const result = install({ project });
  const rules = configuration(project).permissions;
  assert.deepEqual(rules.filter(r => r.action === 'shell' && r.resource === '*'), [{ action: 'shell', resource: '*', effect: 'allow' }]);
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
