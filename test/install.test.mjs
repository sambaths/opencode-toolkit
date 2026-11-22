import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

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

test('unmanaged conflicts abort before any writes', t => {
  const project = fixture(t); const dir = path.join(project, '.opencode/agents'); mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manager.md'), 'my manager');
  const result = run('--project', project);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /conflict/i);
  assert.equal(read(path.join(dir, 'manager.md')), 'my manager');
  assert.equal(existsSync(path.join(project, '.opencode/opencode.json')), false);
  assert.deepEqual(readdirSync(dir), ['manager.md']);
});

test('updates refuse locally modified managed files', t => {
  const project = fixture(t); assert.equal(run('--project', project).status, 0);
  const file = path.join(project, '.opencode/agents/manager.md'); writeFileSync(file, 'customized');
  const result = run('--project', project);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /conflict/i);
  assert.equal(read(file), 'customized');
});

test('conflicting existing permissions are not silently relaxed', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  const file = path.join(project, '.opencode/opencode.json');
  const original = JSON.stringify({ permissions: [{ action: 'shell', resource: '*', effect: 'deny' }] });
  writeFileSync(file, original);
  const result = run('--project', project);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /permission.*conflict/i);
  assert.equal(read(file), original);
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
