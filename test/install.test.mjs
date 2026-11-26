import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, linkSync, lstatSync, truncateSync, rmSync, readdirSync, cpSync, chmodSync, statSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { install, mergeConfig, assertSafePath, parseConfig, unlinkAnchored, writeFileAnchored } from '../lib/install.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'bin/install.mjs');
function fixture(t) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'opencode-installer-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return base;
}
// Every CLI installation test runs offline; RTK provisioning has separate
// orchestrator tests with an injected downloader.
const run = (...args) => spawnSync(process.execPath, [cli, ...args, '--no-rtk'], { encoding: 'utf8' });
const read = file => readFileSync(file, 'utf8');
const configuration = project => JSON.parse(read(path.join(project, '.opencode/opencode.json')));
const DEFAULT_PROFILE = { thinking: 'google/gemini-4-hydrogen', coding: 'opencode/deepseek-v4.1-flash' };
const DEFAULT_COMPACTION = { auto: true, keep: { tokens: 15000 }, buffer: '15%', background: false };
const DEFAULT_TOOL_OUTPUT = { max_lines: 2000, max_bytes: 51200 };
const USAGE_AUDIT_FILES = ['commands/usage-audit.md', 'tools/usage-audit.mjs', 'tools/usage-audit.md', 'tools/usage-audit.test.mjs'];
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
function validatorFixture(t) {
  const directory = mkdtempSync(path.join(root, '.validator-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, 'bin'));
  cpSync(path.join(root, 'bin/validate.mjs'), path.join(directory, 'bin/validate.mjs'));
  cpSync(path.join(root, 'bundle'), path.join(directory, 'bundle'), { recursive: true });
  cpSync(path.join(root, 'package.json'), path.join(directory, 'package.json'));
  cpSync(path.join(root, 'package-lock.json'), path.join(directory, 'package-lock.json'));
  return directory;
}
const runValidator = directory => spawnSync(process.execPath, [path.join(directory, 'bin/validate.mjs')], { encoding: 'utf8' });
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

test('hard-linked backup .gitignore is refused without truncating the external file', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t); const external = path.join(fixture(t), 'external'); writeFileSync(external, 'external sentinel');
  const agents = path.join(project, '.opencode/agents'); mkdirSync(agents, { recursive: true });
  const manager = path.join(agents, 'manager.md'); writeFileSync(manager, 'keep manager');
  const backups = path.join(project, '.opencode/.toolkit-backups'); mkdirSync(backups, { recursive: true });
  linkSync(external, path.join(backups, '.gitignore'));
  assert.throws(() => install({ project }), /hardlink|hard-linked|single-link/i);
  assert.equal(read(external), 'external sentinel'); assert.equal(read(manager), 'keep manager');
});

test('POSIX anchored install writes survive an induced .opencode parent swap without external overwrite', { skip: process.platform !== 'linux' }, t => {
  const project = fixture(t); const directory = path.join(project, '.opencode'); mkdirSync(directory);
  const held = path.join(project, 'held-opencode'); const external = path.join(project, 'external'); mkdirSync(external);
  const victim = path.join(external, 'opencode.json'); writeFileSync(victim, 'EXTERNAL VICTIM');
  writeFileAnchored(path.join(directory, 'opencode.json'), 'anchored content', {
    afterTempCreate: () => { renameSync(directory, held); symlinkSync(external, directory, 'dir'); },
  });
  assert.equal(read(path.join(held, 'opencode.json')), 'anchored content');
  assert.equal(read(victim), 'EXTERNAL VICTIM');
  assert.equal(readdirSync(held).some(name => name.includes('.tmp')), false);
});

test('POSIX install retains project and .opencode anchors across a swap during managed writes', { skip: process.platform !== 'linux' }, t => {
  const project = fixture(t);
  const held = path.join(project, 'held-opencode');
  const external = path.join(project, 'external-opencode'); mkdirSync(external);
  const hook = path.join(fixture(t), 'install-swap-hook.cjs');
  writeFileSync(hook, `
    const fs = require('node:fs');
    const original = fs.writeFileSync;
    let swapped = false;
    fs.writeFileSync = function(fd, data, ...rest) {
      if (!swapped && typeof fd === 'number') {
        let target = '';
        try { target = fs.readlinkSync('/proc/self/fd/' + fd); } catch {}
        if (target.includes('/.opencode/agents/.') && target.endsWith('.tmp')) {
          swapped = true;
          fs.renameSync(${JSON.stringify(path.join(project, '.opencode'))}, ${JSON.stringify(held)});
          fs.symlinkSync(${JSON.stringify(external)}, ${JSON.stringify(path.join(project, '.opencode'))}, 'dir');
        }
      }
      return original.call(fs, fd, data, ...rest);
    };
    require('node:module').syncBuiltinESMExports();
  `);
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${hook}`.trim() };
  const result = spawnSync(process.execPath, [cli, '--project', project, '--no-rtk'], { encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(lstatSync(path.join(project, '.opencode')).isSymbolicLink(), true);
  assert.equal(read(path.join(held, 'agents/manager.md')), renderedAgent('manager'));
  assert.equal(existsSync(path.join(held, 'toolkit-manifest.json')), true);
  assert.deepEqual(readdirSync(external), []);
  assert.equal(readdirSync(path.join(held, 'agents')).some(name => name.includes('.tmp')), false);
});

test('POSIX install retains the project-root anchor across a swap during root-config writes', { skip: process.platform !== 'linux' }, t => {
  const parent = fixture(t); const project = path.join(parent, 'project'); mkdirSync(project); install({ project });
  writeFileSync(path.join(project, 'opencode.json'), JSON.stringify({ agents: { manager: { mode: 'primary' } } }));
  const held = path.join(parent, 'held-project'); const external = path.join(parent, 'external-project'); mkdirSync(external);
  const hook = path.join(parent, 'root-swap-hook.cjs');
  writeFileSync(hook, `
    const fs = require('node:fs');
    const original = fs.writeFileSync;
    let swapped = false;
    fs.writeFileSync = function(fd, data, ...rest) {
      if (!swapped && typeof fd === 'number') {
        let target = '';
        try { target = fs.readlinkSync('/proc/self/fd/' + fd); } catch {}
        if (target.includes('/.opencode.json.toolkit-') && target.endsWith('.tmp')) {
          swapped = true;
          fs.renameSync(${JSON.stringify(project)}, ${JSON.stringify(held)});
          fs.symlinkSync(${JSON.stringify(external)}, ${JSON.stringify(project)}, 'dir');
        }
      }
      return original.call(fs, fd, data, ...rest);
    };
    require('node:module').syncBuiltinESMExports();
  `);
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${hook}`.trim() };
  const result = spawnSync(process.execPath, [cli, '--project', project, '--no-rtk'], { encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(lstatSync(project).isSymbolicLink(), true);
  assert.equal(JSON.parse(read(path.join(held, 'opencode.json'))).agents?.manager, undefined);
  assert.equal(existsSync(path.join(held, '.opencode/toolkit-manifest.json')), true);
  assert.deepEqual(readdirSync(external), []);
  assert.equal(readdirSync(held).some(name => name.includes('.opencode.json.toolkit-')), false);
});

test('POSIX anchored deletion survives an induced .opencode parent swap without deleting the external sentinel', { skip: process.platform !== 'linux' }, t => {
  const project = fixture(t); const directory = path.join(project, '.opencode'); mkdirSync(directory);
  const target = path.join(directory, 'managed.md'); writeFileSync(target, 'managed');
  const held = path.join(project, 'held-opencode'); const external = path.join(project, 'external'); mkdirSync(external);
  const sentinel = path.join(external, 'managed.md'); writeFileSync(sentinel, 'EXTERNAL SENTINEL');
  unlinkAnchored(target, { beforeUnlink: () => { renameSync(directory, held); symlinkSync(external, directory, 'dir'); } });
  assert.equal(existsSync(path.join(held, 'managed.md')), false);
  assert.equal(read(sentinel), 'EXTERNAL SENTINEL');
});

test('POSIX anchored write aborts when the temporary entry is replaced by a symlink', { skip: process.platform !== 'linux' }, t => {
  const project = fixture(t); const directory = path.join(project, '.opencode'); mkdirSync(directory);
  const external = path.join(fixture(t), 'external'); writeFileSync(external, 'EXTERNAL TEMP CANARY');
  const target = path.join(directory, 'opencode.json');
  assert.throws(() => writeFileAnchored(target, 'anchored content', {
    afterTempCreate: () => {
      const [temporary] = readdirSync(directory).filter(name => name.includes('.tmp'));
      assert.ok(temporary, 'temporary entry should exist');
      unlinkSync(path.join(directory, temporary));
      symlinkSync(external, path.join(directory, temporary));
    },
  }), /temporary|identity|single-link|symlink/i);
  assert.equal(existsSync(target), false);
  assert.equal(read(external), 'EXTERNAL TEMP CANARY');
  assert.equal(readdirSync(directory).some(name => name.includes('.tmp')), false);
});

test('POSIX anchored write aborts when the destination entry is replaced by a symlink', { skip: process.platform !== 'linux' }, t => {
  const project = fixture(t); const directory = path.join(project, '.opencode'); mkdirSync(directory);
  const external = path.join(fixture(t), 'external'); writeFileSync(external, 'EXTERNAL DESTINATION CANARY');
  const target = path.join(directory, 'opencode.json'); writeFileSync(target, 'original');
  assert.throws(() => writeFileAnchored(target, 'anchored content', {
    afterTempCreate: () => {
      unlinkSync(target);
      symlinkSync(external, target);
    },
  }), /destination|identity|single-link|symlink/i);
  assert.equal(existsSync(target), false);
  assert.equal(read(external), 'EXTERNAL DESTINATION CANARY');
  assert.equal(readdirSync(directory).some(name => name.includes('.tmp')), false);
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

test('installer accepts exact V2 singular permission objects and rejects mixed V1 maps without leaking canaries', t => {
  const invalid = [
    { name: 'json-v1-map', file: 'opencode.json', content: () => JSON.stringify({ agents: { manager: { permission: { bash: 'allow' } } } }), expected: /Invalid or mixed canonical\/V1/i },
    { name: 'json-extra-field', file: 'opencode.json', content: () => JSON.stringify({ agents: { manager: { permission: { action: 'shel?', resource: '*', effect: 'allow', authorization: 'INSTALLER_PERMISSION_CANARY' } } } }), expected: /Invalid or mixed canonical\/V1/i },
    { name: 'top-level-v1', file: 'opencode.json', content: () => JSON.stringify({ permission: { bash: 'allow' } }), expected: /Invalid or mixed canonical\/V1/i },
    { name: 'markdown-v1', file: '.opencode/agents/manager.md', content: () => '---\npermission:\n  bash: allow\n---\ncustom role\n', expected: /Invalid or mixed canonical\/V1/i },
    { name: 'markdown-extra-field', file: '.opencode/agents/manager.md', content: () => '---\npermission:\n  action: shel?\n  resource: "*"\n  effect: allow\n  authorization: INSTALLER_PERMISSION_CANARY\n---\ncustom role\n', expected: /Invalid or mixed canonical\/V1/i },
  ];
  for (const current of invalid) {
    const project = fixture(t); const file = path.join(project, current.file); mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, current.content());
    assert.throws(() => install({ project }), current.expected, current.name);
    assert.equal(existsSync(path.join(project, '.opencode/toolkit-manifest.json')), false, current.name);
    assert.equal(existsSync(path.join(project, '.opencode/.toolkit-backups')), false, current.name);
    try { install({ project }); } catch (error) { assert.ok(!error.message.includes('INSTALLER_PERMISSION_CANARY'), current.name); }
  }

  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify({ agents: { manager: { mode: 'primary', permission: { action: 'edit', resource: '*', effect: 'deny' } } } }));
  assert.doesNotThrow(() => install({ project }));
});

test('installer and CLI sanitize malformed agent frontmatter and reject YAML warnings without canaries', t => {
  const cases = [
    { name: 'malformed', frontmatter: 'description: "INSTALL_MALFORMED_CANARY\n', expected: /YAML parse failed at line \d+, column \d+/ },
    { name: 'warning', frontmatter: 'description: !YAML_WARNING_CANARY value\n', expected: /YAML warning rejected at line \d+, column \d+/ },
  ];
  for (const current of cases) {
    const project = fixture(t);
    const file = path.join(project, '.opencode/agents/manager.md');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `---\n${current.frontmatter}---\ncustom role\n`);
    const result = run('--project', project);
    assert.notEqual(result.status, 0, current.name);
    assert.match(result.stderr, /manager\.md/, current.name);
    assert.match(result.stderr, current.expected, current.name);
    assert.ok(!result.stderr.includes('INSTALL_MALFORMED_CANARY'), current.name);
    assert.ok(!result.stderr.includes('YAML_WARNING_CANARY'), current.name);
    assert.equal(existsSync(path.join(project, '.opencode/toolkit-manifest.json')), false, current.name);
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
  const manifest = JSON.parse(read(file)); manifest.format = 1; manifest.version = '0.1.0'; delete manifest.models;
  delete manifest.profiles; delete manifest.sources; delete manifest.provenance; delete manifest.generatedProfiles; delete manifest.createdParents;
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
  const sourceConfig = configuration(project);
  sourceConfig.model = 'root/rendered'; sourceConfig.small_model = 'root/small';
  sourceConfig.agents.build.small_model = 'root/build-small';
  sourceConfig.agents.compaction = { model: 'root/compactor' };
  sourceConfig.commands = { audit: { model: 'root/command', small_model: 'root/command-small' } };
  sourceConfig.command = { legacy: { model: 'root/legacy-command', template: '{file:prompts/agents/legacy-command.txt}' } };
  sourceConfig.agent = { legacy: { small_model: 'root/legacy-agent', system: '{file:prompts/agents/legacy-agent.txt}' } };
  writeFileSync(path.join(project, '.opencode/prompts/agents/legacy-command.txt'), 'legacy command prompt');
  writeFileSync(path.join(project, '.opencode/prompts/agents/legacy-agent.txt'), 'legacy agent prompt');
  writeFileSync(path.join(project, '.opencode/LOCAL.md'), 'safe local instructions');
  sourceConfig.instructions.push('.opencode/LOCAL.md');
  writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify(sourceConfig));
  const usageCommand = path.join(project, '.opencode/commands/usage-audit.md');
  writeFileSync(usageCommand, read(usageCommand).replace('---\n', '---\nmodel: root/command-markdown\n'));
  const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(path.join(exporter, 'bundle/skills/toolkit-retro/SKILL.md')));
  assert.ok(existsSync(path.join(exporter, 'bundle/skills/LICENSE.mattpocock.txt')));
  assert.ok(existsSync(path.join(exporter, 'bundle/skills/provenance.json')));
  assert.equal(existsSync(path.join(exporter, 'bundle/skills/unrelated')), false);
  assert.equal(existsSync(path.join(exporter, 'bundle/.toolkit-state')), false);
  for (const relative of ['commands/usage-audit.md', 'tools/usage-audit.mjs', 'tools/usage-audit.md', 'tools/usage-audit.test.mjs',
    'tools/context-tools.mjs', 'tools/context-tools.md', 'tools/context-tools.test.mjs', 'tools/plan-first.test.mjs', 'tools/rtk.md', 'tools/rtk-install.md']) {
    assert.ok(existsSync(path.join(exporter, 'bundle', relative)), relative);
  }
  const exported = JSON.parse(read(path.join(exporter, 'bundle/opencode.json')));
  assert.deepEqual(exported.compaction, DEFAULT_COMPACTION);
  assert.equal(exported.agents.compaction, undefined);
  assert.equal(exported.agents.build.model, undefined);
  assert.equal(exported.agents.build.small_model, undefined);
  assert.equal(exported.model, undefined); assert.equal(exported.small_model, undefined);
  assert.equal(exported.commands.audit.model, undefined); assert.equal(exported.commands.audit.small_model, undefined);
  assert.equal(exported.command.legacy.model, undefined); assert.equal(exported.agent.legacy.small_model, undefined);
  assert.doesNotMatch(read(path.join(exporter, 'bundle/agents/manager.md')), /^(?:model|small_model):/m);
  assert.doesNotMatch(read(path.join(exporter, 'bundle/commands/usage-audit.md')), /^(?:model|small_model):/m);
  assert.equal(read(path.join(exporter, 'bundle/LOCAL.md')), 'safe local instructions');
  assert.equal(read(path.join(exporter, 'bundle/prompts/agents/legacy-command.txt')), 'legacy command prompt');
  assert.equal(read(path.join(exporter, 'bundle/prompts/agents/legacy-agent.txt')), 'legacy agent prompt');
});

test('export rejects machine/account autonomy and browser settings before writing canonical files', t => {
  const project = fixture(t); install({ project });
  const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
  cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
  const source = path.join(project, '.opencode/opencode.json');
  const base = JSON.parse(read(source));
  const cases = [
    config => { config.policy = { shell: 'allow' }; },
    config => { config.automations = false; },
    config => { config.worktree = { base: 'main' }; },
    config => { config.providers = { local: { warming: true } }; },
    config => { config.experimental.full_codemode = true; },
    config => { config.experimental.model_speeds = true; },
    config => { config.experimental.todo = true; },
    config => { config.permissions.push({ action: 'browser', resource: '*', effect: 'allow' }); },
    config => { config.agents.build.permissions = [{ action: 'browser', resource: '*', effect: 'ask' }]; },
    config => { config.agent = { legacy: { permissions: [{ action: 'playwright', resource: '*', effect: 'allow' }] } }; },
    config => { config.agents.build.permissions = [{ action: 'shell', resource: '*', effect: 'allow' }]; },
    config => { config.agents.build.permissions = [{ action: 'shell*', resource: '*', effect: 'ask' }]; },
    config => { config.agents.build.permissions = [{ action: 'shel?', resource: '*', effect: 'allow' }]; },
    config => { config.agents.build.permissions = [{ action: 'shel?', resource: '*', effect: 'allow', authorization: 'EXPORT_PERMISSION_CANARY' }]; },
    config => { config.agents.build.permission = { action: 'shel?', resource: '*', effect: 'allow', authorization: 'EXPORT_PERMISSION_CANARY' }; },
    config => { config.agents.build.permissions = [{ action: '*'.repeat(200), resource: '*', effect: 'allow' }]; },
    config => { config.agents.build.permissions = [{ action: '*shell*', resource: '*', effect: 'ask' }]; },
    config => { config.agents.build.permissions = [{ action: 'b*', resource: '*', effect: 'allow' }]; },
    config => { config.agents.build.permissions = [{ action: '*', resource: '*', effect: 'allow' }]; },
    config => { config.permissions.push({ action: 'shel?', resource: '*', effect: 'allow' }); },
    config => { config.permissions.push({ action: '*shell*', resource: '*', effect: 'ask' }); },
    config => { config.permissions.push({ action: 'b*', resource: '*', effect: 'allow' }); },
    config => { config.permission = { bash: 'allow' }; },
    config => { config.agents.build.permission = { bash: 'allow' }; },
    config => { config.agent = { legacy: { permission: { browser: 'allow' } } }; },
    config => { config.agent = { legacy: { permission: { shell: { resource: '*', effect: 'allow' } } } }; },
    config => { config.agent = { legacy: { permission: { bash: 'allow' } } }; },
  ];
  for (const mutate of cases) {
    const config = structuredClone(base); mutate(config); writeFileSync(source, JSON.stringify(config));
    const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to export/);
    assert.ok(!result.stderr.includes('EXPORT_PERMISSION_CANARY'));
    assert.equal(existsSync(path.join(exporter, 'bundle')), false);
  }
});

test('export rejects request headers, Authorization canaries, provider settings, and unknown file substitutions before writes', t => {
  const cases = [
    { name: 'request-header', mutate: config => { config.request = { headers: { Authorization: 'Bearer EXPORT_AUTHORIZATION_CANARY' } }; }, pattern: /Refusing to export/ },
    { name: 'request-body', mutate: config => { config.request = { body: '{file:prompts/agents/secret.txt}' }; }, pattern: /Refusing to export/ },
    { name: 'provider-options', mutate: config => { config.provider = { local: { options: { headers: { Authorization: 'Bearer EXPORT_PROVIDER_CANARY' } } } }; }, pattern: /Refusing to export/ },
    { name: 'unknown-field', mutate: config => { config.unknown = { nested: '{file:prompts/agents/secret.txt}' }; }, pattern: /file substitution outside approved/i },
    { name: 'agent-unapproved-field', mutate: config => { config.agents.build.description = '{file:prompts/agents/secret.txt}'; }, pattern: /file substitution outside approved/i },
    { name: 'access-token', mutate: config => { config.access_token = 'EXPORT_ACCESS_TOKEN_CANARY'; }, pattern: /Refusing to export/ },
    { name: 'client-secret', mutate: config => { config.client_secret = 'EXPORT_CLIENT_SECRET_CANARY'; }, pattern: /Refusing to export/ },
    { name: 'api-key', mutate: config => { config['api-key'] = 'EXPORT_API_KEY_CANARY'; }, pattern: /Refusing to export/ },
    { name: 'environment-map', mutate: config => { config.environment = { TOKEN: 'EXPORT_ENV_CANARY' }; }, pattern: /Refusing to export/ },
    { name: 'env-map', mutate: config => { config.env = { TOKEN: 'EXPORT_ENV_SHORT_CANARY' }; }, pattern: /Refusing to export/ },
    { name: 'auth-token-alias', mutate: config => { config.authToken = 'EXPORT_AUTH_TOKEN_CANARY'; }, pattern: /Refusing to export/ },
    { name: 'env-vars-alias', mutate: config => { config.envVars = { TOKEN: 'EXPORT_ENV_VARS_CANARY' }; }, pattern: /Refusing to export/ },
    { name: 'environment-variables-alias', mutate: config => { config.environmentVariables = { TOKEN: 'EXPORT_ENVIRONMENT_VARIABLES_CANARY' }; }, pattern: /Refusing to export/ },
    { name: 'literal-bearer', mutate: config => { config.notes = 'Bearer EXPORT_LITERAL_BEARER_CANARY'; }, pattern: /literal credential value/i },
    { name: 'literal-sk', mutate: config => { config.notes = 'sk-EXPORT_LITERAL_SK_CANARY'; }, pattern: /literal credential value/i },
    { name: 'literal-assignment', mutate: config => { config.notes = 'token=HG_SECRET_CANARY'; }, pattern: /literal credential value/i },
    { name: 'env-substitution', mutate: config => { config.agents.build.system = '{env:HG_SECRET_CANARY}'; }, pattern: /environment substitution/i },
    { name: 'top-level-trailing-star', mutate: config => { config.permissions.push({ action: 'shell *', resource: '*', effect: 'allow' }); }, pattern: /shell or wildcard grant/i },
    { name: 'agent-trailing-star', mutate: config => { config.agents.build.permissions = [{ action: 'shell *', resource: '*', effect: 'allow' }]; }, pattern: /shell or wildcard grant/i },
    { name: 'websearch-provider-map', mutate: config => { config.websearch = { provider: { headers: { Authorization: 'Bearer WEBSEARCH_PROVIDER_CANARY' } } }; }, pattern: /websearch provider/i },
    { name: 'websearch-provider-credential', mutate: config => { config.websearch = { provider: 'Bearer WEBSEARCH_PROVIDER_CANARY' }; }, pattern: /websearch provider/i },
    { name: 'websearch-provider-env-map', mutate: config => { config.websearch = { provider: { env: { TOKEN: 'WEBSEARCH_PROVIDER_CANARY' } } }; }, pattern: /websearch provider/i },
    { name: 'github-token-key', mutate: config => { config.githubToken = 'EXPORT_GITHUB_TOKEN_CANARY'; }, pattern: /Refusing to export/ },
    { name: 'gitlab-token-key', mutate: config => { config.gitlabToken = 'EXPORT_GITLAB_TOKEN_CANARY'; }, pattern: /Refusing to export/ },
    { name: 'env-map-alias', mutate: config => { config.envMap = { TOKEN: 'EXPORT_ENV_MAP_CANARY' }; }, pattern: /Refusing to export/ },
    { name: 'environment-vars-alias', mutate: config => { config.environmentVars = { TOKEN: 'EXPORT_ENVIRONMENT_VARS_CANARY' }; }, pattern: /Refusing to export/ },
    { name: 'github-pat-value', mutate: config => { config.notes = 'github_pat_HGSECRETCANARY123'; }, pattern: /literal credential value/i },
    { name: 'gcp-api-key-value', mutate: config => { config.notes = 'AIzaHGSECRETCANARY123456'; }, pattern: /literal credential value/i },
    { name: 'aws-session-value', mutate: config => { config.notes = 'ASIAHGSECRETCANARY12'; }, pattern: /literal credential value/i },
    { name: 'gitlab-pat-value', mutate: config => { config.notes = 'glpat-HGSECRETCANARY123'; }, pattern: /literal credential value/i },
    { name: 'npm-token-value', mutate: config => { config.notes = 'npm_HGSECRETCANARY1234567'; }, pattern: /literal credential value/i },
    { name: 'jwt-value', mutate: config => { config.notes = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJIR1NFQ1JFVCJ9.signature123'; }, pattern: /literal credential value/i },
    { name: 'api-token-alias', mutate: config => { config.apiToken = 'EXPORT_ALIAS_API_TOKEN_CANARY'; }, pattern: /Refusing to export/ },
    { name: 'env-file-alias', mutate: config => { config.envFile = '.env.local'; }, pattern: /Refusing to export/ },
    { name: 'process-env-alias', mutate: config => { config.processEnv = { TOKEN: 'EXPORT_PROCESS_ENV_CANARY' }; }, pattern: /Refusing to export/ },
    { name: 'openai-api-key-alias', mutate: config => { config.openaiApiKey = 'EXPORT_OPENAI_API_KEY_CANARY'; }, pattern: /Refusing to export/ },
    { name: 'stripe-live-value', mutate: config => { config.notes = 'sk_live_HGSECRETCANARY123'; }, pattern: /literal credential value/i },
    { name: 'assignment-punctuation-value', mutate: config => { config.notes = "client_secret: '!HG_SECRET_CANARY' auth_token=\"-HG_SECRET_CANARY\""; }, pattern: /literal credential value/i },
    { name: 'quoted-assignment', mutate: config => { config.notes = '"api_token": "EXPORT_QUOTED_API_TOKEN_CANARY"'; }, pattern: /literal credential value/i },
    { name: 'prefixed-assignment', mutate: config => { config.notes = 'DATABASE_PASSWORD=EXPORT_DATABASE_PASSWORD_CANARY AWS_SECRET_ACCESS_KEY=EXPORT_AWS_SECRET_CANARY OPENAI_API_KEY=EXPORT_OPENAI_KEY_CANARY'; }, pattern: /literal credential value/i },
  ];
  for (const current of cases) {
    const project = fixture(t); install({ project });
    const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
    cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
    writeFileSync(path.join(project, '.opencode/prompts/agents/secret.txt'), 'FILE_SUBSTITUTION_CANARY');
    const config = configuration(project); current.mutate(config);
    writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify(config));
    const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, current.name);
    assert.match(result.stderr, current.pattern, current.name);
    for (const canary of ['EXPORT_AUTHORIZATION_CANARY', 'EXPORT_PROVIDER_CANARY', 'FILE_SUBSTITUTION_CANARY',
      'EXPORT_ACCESS_TOKEN_CANARY', 'EXPORT_CLIENT_SECRET_CANARY', 'EXPORT_API_KEY_CANARY', 'EXPORT_ENV_CANARY', 'EXPORT_ENV_SHORT_CANARY',
      'EXPORT_AUTH_TOKEN_CANARY', 'EXPORT_ENV_VARS_CANARY', 'EXPORT_ENVIRONMENT_VARIABLES_CANARY', 'EXPORT_LITERAL_BEARER_CANARY',
      'EXPORT_LITERAL_SK_CANARY', 'HG_SECRET_CANARY', 'WEBSEARCH_PROVIDER_CANARY', 'EXPORT_GITHUB_TOKEN_CANARY',
      'EXPORT_GITLAB_TOKEN_CANARY', 'EXPORT_ENV_MAP_CANARY', 'EXPORT_ENVIRONMENT_VARS_CANARY',
      'HGSECRETCANARY123', 'HGSECRETCANARY12', 'HGSECRETCANARY1234567', 'EXPORT_ALIAS_API_TOKEN_CANARY',
      'EXPORT_PROCESS_ENV_CANARY', 'EXPORT_OPENAI_API_KEY_CANARY', 'HG_SECRET_CANARY',
      'EXPORT_QUOTED_API_TOKEN_CANARY', 'EXPORT_DATABASE_PASSWORD_CANARY', 'EXPORT_AWS_SECRET_CANARY', 'EXPORT_OPENAI_KEY_CANARY']) {
      assert.ok(!result.stderr.includes(canary), `${current.name}:${canary}`);
    }
    assert.equal(existsSync(path.join(exporter, 'bundle')), false, current.name);
  }
});

test('export rejects browser, shell, and glob wildcard grants in block and flow-style agent Markdown', t => {
  for (const style of ['block', 'flow-map', 'flow-sequence']) for (const action of ['browser', 'shell', 'shell *', 'shell*', 'shel?', '*shell*', 'b*', '*']) {
    const project = fixture(t); install({ project });
    const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
    cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
    const manager = path.join(project, '.opencode/agents/manager.md');
    const permissions = style === 'block' ? `permissions:\n  - action: "${action}"\n    resource: "*"\n    effect: allow\n`
      : style === 'flow-map' ? `permissions: {action: "${action}", resource: "*", effect: allow}\n`
        : `permissions: [{action: "${action}", resource: "*", effect: allow}]\n`;
    writeFileSync(manager, read(manager).replace('permissions:\n  - action: edit\n    resource: "*"\n    effect: deny\n', permissions));
    const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, `${style}:${action}`);
    assert.match(result.stderr, /browser permissions|shell or wildcard grant|invalid permission/i, `${style}:${action}`);
    assert.equal(existsSync(path.join(exporter, 'bundle')), false, `${style}:${action}`);
  }
});

test('export rejects real V1 singular permission maps in Markdown frontmatter', t => {
  for (const style of ['block', 'flow-map']) {
    const project = fixture(t); install({ project });
    const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
    cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
    const manager = path.join(project, '.opencode/agents/manager.md');
    const permission = style === 'block' ? 'permission:\n  bash: allow\n' : 'permission: {bash: allow}\n';
    writeFileSync(manager, read(manager).replace('permissions:\n  - action: edit\n    resource: "*"\n    effect: deny\n', permission));
    const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, style);
    assert.match(result.stderr, /legacy singular permission map/i, style);
    assert.equal(existsSync(path.join(exporter, 'bundle')), false, style);
  }
});

test('export rejects request headers, Authorization canaries, and substitutions in Markdown agent and command frontmatter', t => {
  const cases = [
    { name: 'request-header', target: 'agents/manager.md', mutate: content => content.replace('---\n', '---\nrequest:\n  headers:\n    Authorization: Bearer FRONTMATTER_AUTH_CANARY\n'), canary: 'FRONTMATTER_AUTH_CANARY' },
    { name: 'file-substitution', target: 'agents/manager.md', mutate: content => content.replace(/^description:.*$/m, 'description: "{file:.envrc.local}"'), canary: 'FRONTMATTER_FILE_CANARY' },
    { name: 'env-substitution', target: 'agents/manager.md', mutate: content => content.replace('---\n', '---\nsystem: "{env:HG_SECRET_CANARY}"\n'), canary: 'HG_SECRET_CANARY', pattern: /environment substitution/i },
    { name: 'command-file-substitution', target: 'commands/council.md', mutate: content => content.replace(/^description:.*$/m, 'description: "{file:.envrc.local}"'), canary: 'COMMAND_FRONTMATTER_FILE_CANARY' },
    { name: 'yaml-warning', target: 'agents/manager.md', mutate: content => content.replace(/^description:.*$/m, 'description: !YAML_WARNING_CANARY value'), canary: 'YAML_WARNING_CANARY', pattern: /YAML warning rejected/i },
  ];
  for (const current of cases) {
    const project = fixture(t); install({ project });
    const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
    cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
    const definition = path.join(project, '.opencode', current.target);
    writeFileSync(path.join(project, '.opencode/.envrc.local'), current.canary);
    writeFileSync(definition, current.mutate(read(definition)));
    const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, current.name);
    assert.match(result.stderr, current.pattern ?? /Refusing to export|File substitution outside approved Markdown system body/i, current.name);
    assert.ok(!result.stderr.includes(current.canary), current.name);
    assert.equal(existsSync(path.join(exporter, 'bundle')), false, current.name);
  }
});

test('export sanitizes malformed Markdown frontmatter errors without raw parser or source canaries', t => {
  const project = fixture(t); install({ project });
  const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
  cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
  const manager = path.join(project, '.opencode/agents/manager.md');
  writeFileSync(manager, read(manager).replace('---\n', '---\ndescription: "MALFORMED_YAML_CANARY\n'));
  const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /agents\/manager\.md/);
  assert.match(result.stderr, /YAML parse failed at line \d+, column \d+/);
  assert.ok(!result.stderr.includes('MALFORMED_YAML_CANARY'));
  assert.equal(existsSync(path.join(exporter, 'bundle')), false);
});

test('validator sanitizes malformed Markdown frontmatter errors without raw parser or source canaries', t => {
  const directory = validatorFixture(t);
  const manager = path.join(directory, 'bundle/agents/manager.md');
  writeFileSync(manager, read(manager).replace('---\n', '---\ndescription: "MALFORMED_YAML_CANARY\n'));
  const result = runValidator(directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /agents\/manager\.md/);
  assert.match(result.stderr, /YAML parse failed at line \d+, column \d+/);
  assert.ok(!result.stderr.includes('MALFORMED_YAML_CANARY'));
});

test('validator rejects real V1 singular permission maps and protected action globs', t => {
  const cases = [
    { name: 'top-level-v1', config: value => { value.permission = { bash: 'allow' }; }, expected: /Legacy singular permission map refused/ },
    { name: 'json-agent-v1', config: value => { value.agents.build.permission = { bash: 'allow' }; }, expected: /Legacy singular permission map refused/ },
    { name: 'legacy-agent-v1', config: value => { value.agent = { legacy: { permission: { bash: 'allow' } } }; }, expected: /Legacy singular permission map refused/ },
    { name: 'agent-shel-glob', config: value => { value.agents.build.permissions = [{ action: 'shel?', resource: '*', effect: 'allow' }]; }, expected: /Agent shell or wildcard grant exported/ },
    { name: 'agent-extra-field', config: value => { value.agents.build.permissions = [{ action: 'shel?', resource: '*', effect: 'allow', authorization: 'VALIDATOR_PERMISSION_CANARY' }]; }, expected: /Invalid or mixed canonical\/V1 permission rule/ },
    { name: 'agent-singular-extra-field', config: value => { value.agents.build.permission = { action: 'shel?', resource: '*', effect: 'allow', authorization: 'VALIDATOR_PERMISSION_CANARY' }; }, expected: /Invalid or mixed canonical\/V1 permission rule/ },
    { name: 'agent-200-stars', config: value => { value.agents.build.permissions = [{ action: '*'.repeat(200), resource: '*', effect: 'allow' }]; }, expected: /Agent shell or wildcard grant exported/ },
    { name: 'agent-shell-glob', config: value => { value.agents.build.permissions = [{ action: '*shell*', resource: '*', effect: 'ask' }]; }, expected: /Agent shell or wildcard grant exported/ },
    { name: 'agent-browser-glob', config: value => { value.agents.build.permissions = [{ action: 'b*', resource: '*', effect: 'allow' }]; }, expected: /Agent shell or wildcard grant exported/ },
    { name: 'top-level-glob', config: value => { value.permissions.push({ action: 'shel?', resource: '*', effect: 'allow' }); }, expected: /Agent shell or wildcard grant exported/ },
    { name: 'markdown-v1', markdown: true, expected: /Legacy singular permission map refused/ },
    { name: 'markdown-glob', markdown: true, glob: true, expected: /Agent shell or wildcard grant exported/ },
    { name: 'markdown-trailing-star', markdown: true, trailing: true, expected: /Agent shell or wildcard grant exported/ },
  ];
  for (const current of cases) {
    const directory = validatorFixture(t);
    const configFile = path.join(directory, 'bundle/opencode.json');
    const config = JSON.parse(read(configFile));
    if (current.config) current.config(config);
    writeFileSync(configFile, JSON.stringify(config));
    if (current.markdown) {
      const manager = path.join(directory, 'bundle/agents/manager.md');
      const replacement = current.trailing
        ? 'permissions:\n  - action: "shell *"\n    resource: "*"\n    effect: allow\n'
        : current.glob
          ? 'permissions:\n  - action: "shel?"\n    resource: "*"\n    effect: allow\n'
          : 'permission: {bash: allow}\n';
      writeFileSync(manager, read(manager).replace('permissions:\n  - action: edit\n    resource: "*"\n    effect: deny\n', replacement));
    }
    const result = runValidator(directory);
    assert.notEqual(result.status, 0, current.name);
    assert.match(result.stderr, current.expected, current.name);
    assert.ok(!result.stderr.includes('VALIDATOR_PERMISSION_CANARY'), current.name);
  }
});

test('validator rejects request headers, Authorization canaries, provider settings, and unknown file substitutions', t => {
  const cases = [
    { name: 'request-header', mutate: config => { config.request = { headers: { Authorization: 'Bearer VALIDATOR_AUTHORIZATION_CANARY' } }; }, expected: /Request or credential-bearing setting exported/ },
    { name: 'request-body', mutate: config => { config.request = { body: '{file:prompts/agents/secret.txt}' }; }, expected: /Request or credential-bearing setting exported/ },
    { name: 'provider-options', mutate: config => { config.provider = { local: { options: { headers: { Authorization: 'Bearer VALIDATOR_PROVIDER_CANARY' } } } }; }, expected: /Machine\/account autonomy setting exported/ },
    { name: 'unknown-field', mutate: config => { config.unknown = { nested: '{file:prompts/agents/secret.txt}' }; }, expected: /File substitution outside approved/ },
    { name: 'agent-unapproved-field', mutate: config => { config.agents.build.description = '{file:prompts/agents/secret.txt}'; }, expected: /File substitution outside approved/ },
    { name: 'access-token', mutate: config => { config.access_token = 'VALIDATOR_ACCESS_TOKEN_CANARY'; }, expected: /Request or credential-bearing setting exported/ },
    { name: 'client-secret', mutate: config => { config.client_secret = 'VALIDATOR_CLIENT_SECRET_CANARY'; }, expected: /Request or credential-bearing setting exported/ },
    { name: 'api-key', mutate: config => { config['api-key'] = 'VALIDATOR_API_KEY_CANARY'; }, expected: /Request or credential-bearing setting exported/ },
    { name: 'environment-map', mutate: config => { config.environment = { TOKEN: 'VALIDATOR_ENV_CANARY' }; }, expected: /Machine\/account autonomy setting exported/ },
    { name: 'env-map', mutate: config => { config.env = { TOKEN: 'VALIDATOR_ENV_SHORT_CANARY' }; }, expected: /Machine\/account autonomy setting exported/ },
    { name: 'auth-token-alias', mutate: config => { config.authToken = 'VALIDATOR_AUTH_TOKEN_CANARY'; }, expected: /Request or credential-bearing setting exported/ },
    { name: 'env-vars-alias', mutate: config => { config.envVars = { TOKEN: 'VALIDATOR_ENV_VARS_CANARY' }; }, expected: /Machine\/account autonomy setting exported/ },
    { name: 'environment-variables-alias', mutate: config => { config.environmentVariables = { TOKEN: 'VALIDATOR_ENVIRONMENT_VARIABLES_CANARY' }; }, expected: /Machine\/account autonomy setting exported/ },
    { name: 'literal-bearer', mutate: config => { config.notes = 'Bearer VALIDATOR_LITERAL_BEARER_CANARY'; }, expected: /Literal credential value exported/ },
    { name: 'literal-sk', mutate: config => { config.notes = 'sk-VALIDATOR_LITERAL_SK_CANARY'; }, expected: /Literal credential value exported/ },
    { name: 'literal-assignment', mutate: config => { config.notes = 'token=HG_SECRET_CANARY'; }, expected: /Literal credential value exported/ },
    { name: 'env-substitution', mutate: config => { config.agents.build.system = '{env:HG_SECRET_CANARY}'; }, expected: /Environment substitution in portable config/ },
    { name: 'top-level-trailing-star', mutate: config => { config.permissions.push({ action: 'shell *', resource: '*', effect: 'allow' }); }, expected: /Agent shell or wildcard grant exported/ },
    { name: 'agent-trailing-star', mutate: config => { config.agents.build.permissions = [{ action: 'shell *', resource: '*', effect: 'allow' }]; }, expected: /Agent shell or wildcard grant exported/ },
    { name: 'websearch-provider-map', mutate: config => { config.websearch = { provider: { headers: { Authorization: 'Bearer WEBSEARCH_PROVIDER_CANARY' } } }; }, expected: /Invalid websearch provider setting/ },
    { name: 'websearch-provider-credential', mutate: config => { config.websearch = { provider: 'Bearer WEBSEARCH_PROVIDER_CANARY' }; }, expected: /Invalid websearch provider setting/ },
    { name: 'websearch-provider-env-map', mutate: config => { config.websearch = { provider: { env: { TOKEN: 'WEBSEARCH_PROVIDER_CANARY' } } }; }, expected: /Invalid websearch provider setting/ },
    { name: 'github-token-key', mutate: config => { config.githubToken = 'VALIDATOR_GITHUB_TOKEN_CANARY'; }, expected: /Request or credential-bearing setting exported/ },
    { name: 'gitlab-token-key', mutate: config => { config.gitlabToken = 'VALIDATOR_GITLAB_TOKEN_CANARY'; }, expected: /Request or credential-bearing setting exported/ },
    { name: 'env-map-alias', mutate: config => { config.envMap = { TOKEN: 'VALIDATOR_ENV_MAP_CANARY' }; }, expected: /Machine\/account autonomy setting exported/ },
    { name: 'environment-vars-alias', mutate: config => { config.environmentVars = { TOKEN: 'VALIDATOR_ENVIRONMENT_VARS_CANARY' }; }, expected: /Machine\/account autonomy setting exported/ },
    { name: 'github-pat-value', mutate: config => { config.notes = 'github_pat_HGSECRETCANARY123'; }, expected: /Literal credential value exported/ },
    { name: 'gcp-api-key-value', mutate: config => { config.notes = 'AIzaHGSECRETCANARY123456'; }, expected: /Literal credential value exported/ },
    { name: 'aws-session-value', mutate: config => { config.notes = 'ASIAHGSECRETCANARY12'; }, expected: /Literal credential value exported/ },
    { name: 'gitlab-pat-value', mutate: config => { config.notes = 'glpat-HGSECRETCANARY123'; }, expected: /Literal credential value exported/ },
    { name: 'npm-token-value', mutate: config => { config.notes = 'npm_HGSECRETCANARY1234567'; }, expected: /Literal credential value exported/ },
    { name: 'jwt-value', mutate: config => { config.notes = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJIR1NFQ1JFVCJ9.signature123'; }, expected: /Literal credential value exported/ },
    { name: 'api-token-alias', mutate: config => { config.apiToken = 'VALIDATOR_ALIAS_API_TOKEN_CANARY'; }, expected: /Request or credential-bearing setting exported/ },
    { name: 'env-file-alias', mutate: config => { config.envFile = '.env.local'; }, expected: /Machine\/account autonomy setting exported/ },
    { name: 'process-env-alias', mutate: config => { config.processEnv = { TOKEN: 'VALIDATOR_PROCESS_ENV_CANARY' }; }, expected: /Machine\/account autonomy setting exported/ },
    { name: 'openai-api-key-alias', mutate: config => { config.openaiApiKey = 'VALIDATOR_OPENAI_API_KEY_CANARY'; }, expected: /Request or credential-bearing setting exported/ },
    { name: 'stripe-live-value', mutate: config => { config.notes = 'rk_live_HGSECRETCANARY123'; }, expected: /Literal credential value exported/ },
    { name: 'assignment-punctuation-value', mutate: config => { config.notes = "client_secret: '!HG_SECRET_CANARY' auth_token=\"-HG_SECRET_CANARY\""; }, expected: /Literal credential value exported/ },
    { name: 'quoted-assignment', mutate: config => { config.notes = '"api_token": "VALIDATOR_QUOTED_API_TOKEN_CANARY"'; }, expected: /Literal credential value exported/ },
    { name: 'prefixed-assignment', mutate: config => { config.notes = 'DATABASE_PASSWORD=VALIDATOR_DATABASE_PASSWORD_CANARY AWS_SECRET_ACCESS_KEY=VALIDATOR_AWS_SECRET_CANARY OPENAI_API_KEY=VALIDATOR_OPENAI_KEY_CANARY'; }, expected: /Literal credential value exported/ },
  ];
  for (const current of cases) {
    const directory = validatorFixture(t);
    const configFile = path.join(directory, 'bundle/opencode.json');
    const config = JSON.parse(read(configFile)); current.mutate(config);
    writeFileSync(configFile, JSON.stringify(config));
    writeFileSync(path.join(directory, 'bundle/prompts/agents/secret.txt'), 'VALIDATOR_FILE_SUBSTITUTION_CANARY');
    const result = runValidator(directory);
    assert.notEqual(result.status, 0, current.name);
    assert.match(result.stderr, current.expected, current.name);
    for (const canary of ['VALIDATOR_AUTHORIZATION_CANARY', 'VALIDATOR_PROVIDER_CANARY', 'VALIDATOR_FILE_SUBSTITUTION_CANARY',
      'VALIDATOR_ACCESS_TOKEN_CANARY', 'VALIDATOR_CLIENT_SECRET_CANARY', 'VALIDATOR_API_KEY_CANARY', 'VALIDATOR_ENV_CANARY', 'VALIDATOR_ENV_SHORT_CANARY',
      'VALIDATOR_AUTH_TOKEN_CANARY', 'VALIDATOR_ENV_VARS_CANARY', 'VALIDATOR_ENVIRONMENT_VARIABLES_CANARY', 'VALIDATOR_LITERAL_BEARER_CANARY',
      'VALIDATOR_LITERAL_SK_CANARY', 'HG_SECRET_CANARY', 'WEBSEARCH_PROVIDER_CANARY', 'VALIDATOR_GITHUB_TOKEN_CANARY',
      'VALIDATOR_GITLAB_TOKEN_CANARY', 'VALIDATOR_ENV_MAP_CANARY', 'VALIDATOR_ENVIRONMENT_VARS_CANARY',
      'HGSECRETCANARY123', 'HGSECRETCANARY12', 'HGSECRETCANARY1234567', 'VALIDATOR_ALIAS_API_TOKEN_CANARY',
      'VALIDATOR_PROCESS_ENV_CANARY', 'VALIDATOR_OPENAI_API_KEY_CANARY', 'HG_SECRET_CANARY',
      'VALIDATOR_QUOTED_API_TOKEN_CANARY', 'VALIDATOR_DATABASE_PASSWORD_CANARY', 'VALIDATOR_AWS_SECRET_CANARY', 'VALIDATOR_OPENAI_KEY_CANARY']) {
      assert.ok(!result.stderr.includes(canary), `${current.name}:${canary}`);
    }
  }
});

test('validator rejects request headers, Authorization canaries, and substitutions in Markdown agent and command frontmatter', t => {
  const cases = [
    { name: 'request-header', target: 'agents/manager.md', mutate: content => content.replace('---\n', '---\nrequest:\n  headers:\n    Authorization: Bearer VALIDATOR_FRONTMATTER_AUTH_CANARY\n'), expected: /Request or credential-bearing setting exported/, canary: 'VALIDATOR_FRONTMATTER_AUTH_CANARY' },
    { name: 'file-substitution', target: 'agents/manager.md', mutate: content => content.replace(/^description:.*$/m, 'description: "{file:.envrc.local}"'), expected: /File substitution outside approved Markdown system body/, canary: 'VALIDATOR_FRONTMATTER_FILE_CANARY' },
    { name: 'env-substitution', target: 'agents/manager.md', mutate: content => content.replace('---\n', '---\nsystem: "{env:HG_SECRET_CANARY}"\n'), expected: /Environment substitution outside approved Markdown system body/, canary: 'HG_SECRET_CANARY' },
    { name: 'command-file-substitution', target: 'commands/council.md', mutate: content => content.replace(/^description:.*$/m, 'description: "{file:.envrc.local}"'), expected: /File substitution outside approved Markdown system body/, canary: 'COMMAND_FRONTMATTER_FILE_CANARY' },
    { name: 'yaml-warning', target: 'agents/manager.md', mutate: content => content.replace(/^description:.*$/m, 'description: !YAML_WARNING_CANARY value'), expected: /YAML warning rejected/, canary: 'YAML_WARNING_CANARY' },
  ];
  for (const current of cases) {
    const directory = validatorFixture(t);
    const definition = path.join(directory, 'bundle', current.target);
    writeFileSync(path.join(directory, 'bundle/.envrc.local'), current.canary);
    writeFileSync(definition, current.mutate(read(definition)));
    const result = runValidator(directory);
    assert.notEqual(result.status, 0, current.name);
    assert.match(result.stderr, current.expected, current.name);
    assert.ok(!result.stderr.includes(current.canary), current.name);
  }
});

test('validator rejects sensitive, linked, and non-canonical prompt file references', t => {
  const cases = [
    { name: 'npmrc', reference: '.npmrc', expected: /sensitive path/ },
    { name: 'envrc', reference: '.envrc', expected: /sensitive path/ },
    { name: 'envrc-local', reference: '.envrc.local', expected: /sensitive path/ },
    { name: 'auth-segment', reference: 'auth/config.txt', expected: /sensitive path/ },
    { name: 'secret-segment', reference: 'secret/config.txt', expected: /sensitive path/ },
    { name: 'credential-segment', reference: 'credential/config.txt', expected: /sensitive path/ },
    { name: 'symlink', reference: 'prompts/agents/linked.txt', expected: /symlinked path component/ },
    { name: 'hardlink', reference: 'prompts/agents/hard.txt', expected: /hard-linked file/ },
    { name: 'traversal', reference: '../outside.txt', expected: /unsafe or non-canonical path/ },
    { name: 'noncanonical', reference: 'prompts/agents/../agents/build.txt', expected: /unsafe or non-canonical path/ },
  ];
  for (const current of cases) {
    const directory = validatorFixture(t);
    const configFile = path.join(directory, 'bundle/opencode.json');
    const config = JSON.parse(read(configFile));
    config.agents.build.system = `{file:${current.reference}}`;
    writeFileSync(configFile, JSON.stringify(config));
    const outside = path.join(directory, 'outside.txt'); writeFileSync(outside, 'VALIDATOR_SECRET_CANARY');
    if (current.name === 'npmrc') writeFileSync(path.join(directory, 'bundle/.npmrc'), 'VALIDATOR_SECRET_CANARY');
    if (current.name === 'envrc') writeFileSync(path.join(directory, 'bundle/.envrc'), 'VALIDATOR_SECRET_CANARY');
    if (['envrc-local', 'auth-segment', 'secret-segment', 'credential-segment'].includes(current.name)) {
      const file = path.join(directory, 'bundle', current.reference);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, 'VALIDATOR_SECRET_CANARY');
    }
    if (current.name === 'symlink') symlinkSync(outside, path.join(directory, 'bundle', current.reference));
    if (current.name === 'hardlink') linkSync(outside, path.join(directory, 'bundle', current.reference));
    const result = runValidator(directory);
    assert.notEqual(result.status, 0, current.name);
    assert.match(result.stderr, current.expected, current.name);
    assert.ok(!result.stderr.includes('VALIDATOR_SECRET_CANARY'), current.name);
  }
});

test('export strips mixed-case machine keys while retaining safe browser deny rules', t => {
  const project = fixture(t); install({ project });
  const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
  cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
  const config = configuration(project);
  config.McP = { secret: true }; config.PLUGINS = ['x']; config.Plugin = 'x'; config.RtK = { enabled: true };
  config.experimental.RtK = { enabled: true };
  writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify(config));
  const manager = path.join(project, '.opencode/agents/manager.md');
  writeFileSync(manager, read(manager).replace('permissions:\n  - action: edit\n    resource: "*"\n    effect: deny\n', 'permissions:\n  - action: browser\n    resource: "*"\n    effect: deny\n  - action: shell\n    resource: "*"\n    effect: deny\n'));
  const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const exported = JSON.parse(read(path.join(exporter, 'bundle/opencode.json')));
  for (const key of Object.keys(exported)) assert.ok(!['mcp', 'plugins', 'plugin', 'rtk'].includes(key.toLowerCase()), key);
  for (const key of Object.keys(exported.experimental)) assert.notEqual(key.toLowerCase(), 'rtk');
  assert.match(read(path.join(exporter, 'bundle/agents/manager.md')), /effect: deny/);
});

test('final config destination symlink is rejected before any partial export writes', t => {
  const project = fixture(t); install({ project });
  const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts')); mkdirSync(path.join(exporter, 'bundle'));
  cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
  const victim = path.join(exporter, 'victim.json'); writeFileSync(victim, 'VICTIM SENTINEL');
  symlinkSync(victim, path.join(exporter, 'bundle/opencode.json'));
  const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink/i);
  assert.equal(read(victim), 'VICTIM SENTINEL');
  assert.deepEqual(readdirSync(path.join(exporter, 'bundle')), ['opencode.json']);
});

test('Linux parent swap after 4MiB temp creation cleans the held directory without external writes', { skip: process.platform !== 'linux' }, t => {
  const project = fixture(t); install({ project });
  const huge = path.join(project, '.opencode/instructions/huge.md'); writeFileSync(huge, Buffer.alloc(4 * 1024 * 1024, 'x'));
  const config = configuration(project); config.instructions.push('.opencode/instructions/huge.md');
  writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify(config));
  const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
  cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
  const held = path.join(exporter, 'held-original'); const external = path.join(exporter, 'external'); mkdirSync(external);
  const hook = path.join(exporter, 'race-hook.cjs');
  writeFileSync(hook, `
    const fs = require('node:fs');
    const path = require('node:path');
    const original = fs.writeFileSync;
    let swapped = false;
    fs.writeFileSync = function(fd, data, ...rest) {
      if (!swapped && typeof fd === 'number') {
        let target = '';
        try { target = fs.readlinkSync('/proc/self/fd/' + fd); } catch {}
        if (target.includes('/bundle/instructions/.huge.md.') && target.endsWith('.tmp')) {
          swapped = true;
          const parent = path.dirname(target);
          fs.renameSync(parent, ${JSON.stringify(held)});
          fs.symlinkSync(${JSON.stringify(external)}, parent, 'dir');
        }
      }
      return original.call(fs, fd, data, ...rest);
    };
    require('node:module').syncBuiltinESMExports();
  `);
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${hook}`.trim() };
  const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8', env });
  assert.notEqual(result.status, 0, result.stderr);
  assert.equal(existsSync(held), true, result.stderr);
  assert.equal(readdirSync(held).some(name => name.includes('.tmp')), false);
  assert.deepEqual(readdirSync(external), []);
});

test('export confines file references and rejects outside secrets, symlinks, and hardlinks before writes', t => {
  for (const kind of ['outside', 'symlink', 'hardlink']) {
    const project = fixture(t); install({ project });
    const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
    cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
    const outside = path.join(project, 'outside-secret.txt'); writeFileSync(outside, 'OUTSIDE SECRET');
    const sourceConfig = configuration(project);
    const reference = kind === 'outside' ? '../outside-secret.txt' : 'prompts/agents/linked.txt';
    sourceConfig.agents.build.system = `{file:${reference}}`;
    writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify(sourceConfig));
    if (kind !== 'outside') {
      const linked = path.join(project, '.opencode', reference);
      if (kind === 'symlink') symlinkSync(outside, linked);
      else linkSync(outside, linked);
    }
    const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, kind);
    assert.match(result.stderr, /traversal|symlink|hard-link/i, kind);
    assert.doesNotMatch(result.stderr, /OUTSIDE SECRET/);
    assert.equal(existsSync(path.join(exporter, 'bundle')), false, kind);
  }
});

test('export rejects a dangling destination symlink without creating its target', t => {
  const project = fixture(t); install({ project });
  const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
  cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
  const target = path.join(exporter, 'missing-target');
  symlinkSync(target, path.join(exporter, 'bundle'));
  const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink/i);
  assert.equal(lstatSync(path.join(exporter, 'bundle')).isSymbolicLink(), true);
  assert.equal(existsSync(target), false);
});

test('export validates every instruction as portable, safe, and non-sensitive before writes', t => {
  for (const kind of ['absolute', 'remote', 'traversal', 'symlink', 'npmrc', 'envrc', 'envrc-local', 'auth-segment', 'secret-segment', 'credential-segment', 'npmrc-alias', 'dotdot-alias', 'drive', 'unc']) {
    const project = fixture(t); install({ project });
    const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
    cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
    const config = configuration(project);
    const outside = path.join(project, 'outside.md'); writeFileSync(outside, 'outside');
    if (kind === 'absolute') config.instructions = [outside];
    else if (kind === 'remote') config.instructions = ['https://example.invalid/instructions.md'];
    else if (kind === 'traversal') config.instructions = ['.opencode/../outside.md'];
    else if (kind === 'npmrc') {
      writeFileSync(path.join(project, '.opencode/.npmrc'), 'secret');
      config.instructions = ['.opencode/.npmrc'];
    } else if (kind === 'envrc') {
      writeFileSync(path.join(project, '.opencode/.envrc'), 'ENVRC_EXPORT_CANARY');
      config.instructions = ['.opencode/.envrc'];
    } else if (['envrc-local', 'auth-segment', 'secret-segment', 'credential-segment'].includes(kind)) {
      const relative = { 'envrc-local': '.envrc.local', 'auth-segment': 'auth/config.txt', 'secret-segment': 'secret/config.txt', 'credential-segment': 'credential/config.txt' }[kind];
      const file = path.join(project, '.opencode', relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, `${kind.toUpperCase()}_EXPORT_CANARY`);
      config.instructions = [`.opencode/${relative}`];
    } else if (kind === 'npmrc-alias') config.instructions = ['.opencode/.npmrc.'];
    else if (kind === 'dotdot-alias') config.instructions = ['.opencode/.. /outside.md'];
    else if (kind === 'drive') config.instructions = ['.opencode/C:\\outside.md'];
    else if (kind === 'unc') config.instructions = ['.opencode/\\\\server\\share\\outside.md'];
    else {
      symlinkSync(outside, path.join(project, '.opencode/instructions/linked.md'));
      config.instructions = ['.opencode/instructions/linked.md'];
    }
    writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify(config));
    const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, kind);
    assert.match(result.stderr, /instruction|sensitive|symlink|traversal|absolute|alias/i, kind);
    assert.doesNotMatch(result.stderr, /EXPORT_CANARY/);
    assert.equal(existsSync(path.join(exporter, 'bundle')), false, kind);
  }
});

test('export rejects sensitive source roots and ancestors before reading allowlisted files', t => {
  for (const sensitive of ['.password-store', '.envrc', '.envrc.local']) {
    const parent = fixture(t); const project = path.join(parent, sensitive, 'project'); install({ project });
    const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
    cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
    const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, sensitive);
    assert.match(result.stderr, /sensitive/i, sensitive);
    assert.equal(existsSync(path.join(exporter, 'bundle')), false, sensitive);
  }
});

test('export bounds entries, sparse per-file size, and aggregate source bytes before writes', t => {
  for (const kind of ['entries', 'file', 'aggregate']) {
    const project = fixture(t); install({ project });
    const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
    cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
    const config = configuration(project);
    if (kind === 'entries') {
      for (let index = 0; index < 500; index++) {
        const relative = `prompts/agents/extra-${index}.txt`;
        writeFileSync(path.join(project, '.opencode', relative), 'x');
        config.agents[`extra-${index}`] = { system: `{file:${relative}}` };
      }
    } else if (kind === 'file') {
      const relative = 'prompts/agents/huge.txt'; const file = path.join(project, '.opencode', relative);
      writeFileSync(file, ''); truncateSync(file, 4 * 1024 * 1024 + 1);
      config.agents.build.system = `{file:${relative}}`;
    } else {
      for (let index = 0; index < 9; index++) {
        const relative = `prompts/agents/sparse-${index}.txt`; const file = path.join(project, '.opencode', relative);
        writeFileSync(file, ''); truncateSync(file, 4 * 1024 * 1024);
        config.agents[`sparse-${index}`] = { system: `{file:${relative}}` };
      }
    }
    writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify(config));
    const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, kind);
    assert.match(result.stderr, kind === 'entries' ? /entry limit/i : kind === 'file' ? /file limit/i : /aggregate limit/i, kind);
    assert.equal(existsSync(path.join(exporter, 'bundle')), false, kind);
  }
});

test('export enforces global traversal and recursion depth budgets', t => {
  for (const kind of ['traversal', 'depth']) {
    const project = fixture(t); install({ project });
    const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
    cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
    const skill = path.join(project, '.opencode/skills/toolkit-retro');
    if (kind === 'traversal') {
      for (let group = 0; group < 6; group++) for (let index = 0; index < 100; index++) mkdirSync(path.join(skill, `group-${group}`, `empty-${index}`), { recursive: true });
    } else {
      let current = skill;
      for (let index = 0; index < 40; index++) { current = path.join(current, `level-${index}`); mkdirSync(current); }
    }
    const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, kind);
    assert.match(result.stderr, kind === 'traversal' ? /traversal budget/i : /recursion limit/i, kind);
    assert.equal(existsSync(path.join(exporter, 'bundle')), false, kind);
  }
});

test('export charges actual bytes when files grow after preflight', { skip: process.platform !== 'linux' }, t => {
  const project = fixture(t); install({ project });
  const config = configuration(project); const files = [];
  for (let index = 0; index < 9; index++) {
    const relative = `prompts/agents/grow-${index}.txt`; const file = path.join(project, '.opencode', relative);
    writeFileSync(file, 'x'); files.push(file); config.agents[`grow-${index}`] = { system: `{file:${relative}}` };
  }
  writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify(config));
  const exporter = fixture(t); mkdirSync(path.join(exporter, 'scripts'));
  cpSync(path.join(root, 'scripts/export.mjs'), path.join(exporter, 'scripts/export.mjs'));
  const hook = path.join(exporter, 'growth-hook.cjs');
  writeFileSync(hook, `
    const fs = require('node:fs');
    const original = fs.readSync;
    let grown = false;
    fs.readSync = function(fd, buffer, offset, length, position) {
      if (!grown) {
        let target = '';
        try { target = fs.readlinkSync('/proc/self/fd/' + fd); } catch {}
        if (target.includes('/prompts/agents/grow-')) {
          grown = true;
          for (const file of ${JSON.stringify(files)}) fs.truncateSync(file, 4 * 1024 * 1024);
        }
      }
      return original.call(fs, fd, buffer, offset, length, position);
    };
    require('node:module').syncBuiltinESMExports();
  `);
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${hook}`.trim() };
  const result = spawnSync(process.execPath, [path.join(exporter, 'scripts/export.mjs'), path.join(project, '.opencode')], { encoding: 'utf8', env });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /actual aggregate limit/i);
  assert.equal(existsSync(path.join(exporter, 'bundle')), false);
});

test('fresh installs enable compaction, tool output caps, and usage audit with format 2 state', t => {
  const project = fixture(t);
  const result = run('--project', project);
  assert.equal(result.status, 0, result.stderr);
  const config = configuration(project);
  assert.deepEqual(config.compaction, DEFAULT_COMPACTION);
  assert.deepEqual(config.tool_output, DEFAULT_TOOL_OUTPUT);
  assert.equal(config.agents.compaction, undefined);
  for (const relative of USAGE_AUDIT_FILES) assert.ok(existsSync(path.join(project, '.opencode', relative)), relative);
  const manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
  assert.equal(manifest.format, 2);
  assert.equal(manifest.version, '0.2.0');
  assert.deepEqual(manifest.profiles, { compaction: true, toolOutput: true, usageAudit: true });
  assert.deepEqual(manifest.sources, { compaction: 'generated', toolOutput: 'generated', usageAudit: 'generated' });
  assert.deepEqual(manifest.generatedProfiles, { compaction: DEFAULT_COMPACTION, toolOutput: DEFAULT_TOOL_OUTPUT });
  assert.ok(manifest.createdParents.some(parent => JSON.stringify(parent) === JSON.stringify(['compaction', 'keep'])));
  assert.match(result.stdout, /Optimization profiles: compaction enabled; tool output enabled; usage audit enabled/);
  assert.match(result.stdout, /Optimization sources: compaction generated; tool output generated; usage audit generated/);
  assertAssignments(project, DEFAULT_PROFILE);
  assert.deepEqual(install({ project }).changes, []);
});

test('each optimization opt-out removes only its managed config and usage artifacts', t => {
  const cases = [
    { flag: '--no-compaction', key: 'compaction', absent: ['compaction'] },
    { flag: '--no-tool-output', key: 'toolOutput', absent: ['tool_output'] },
    { flag: '--no-usage-audit', key: 'usageAudit', absent: USAGE_AUDIT_FILES },
  ];
  for (const current of cases) {
    const project = fixture(t);
    assert.equal(run('--project', project).status, 0);
    const result = run('--project', project, current.flag);
    assert.equal(result.status, 0, result.stderr);
    const config = configuration(project);
    if (current.key === 'compaction') {
      assert.equal(config.compaction, undefined);
      assert.deepEqual(config.tool_output, DEFAULT_TOOL_OUTPUT);
    } else if (current.key === 'toolOutput') {
      assert.equal(config.tool_output, undefined);
      assert.deepEqual(config.compaction, DEFAULT_COMPACTION);
    } else {
      for (const relative of USAGE_AUDIT_FILES) assert.equal(existsSync(path.join(project, '.opencode', relative)), false, relative);
      assert.deepEqual(config.compaction, DEFAULT_COMPACTION);
    }
    const manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
    assert.equal(manifest.profiles[current.key], false);
    assert.deepEqual(install({ project }).changes, []);
  }
});

test('master opt-out persists and paired positive flags re-enable selected profiles', t => {
  const project = fixture(t);
  let result = run('--project', project, '--no-optimizations');
  assert.equal(result.status, 0, result.stderr);
  let config = configuration(project);
  assert.equal(config.compaction, undefined);
  assert.equal(config.tool_output, undefined);
  for (const relative of USAGE_AUDIT_FILES) assert.equal(existsSync(path.join(project, '.opencode', relative)), false, relative);
  assert.deepEqual(JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json'))).profiles,
    { compaction: false, toolOutput: false, usageAudit: false });
  result = run('--project', project);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /compaction disabled; tool output disabled; usage audit disabled/);
  result = run('--project', project, '--compaction', '--usage-audit');
  assert.equal(result.status, 0, result.stderr);
  config = configuration(project);
  assert.deepEqual(config.compaction, DEFAULT_COMPACTION);
  assert.equal(config.agents.compaction, undefined);
  assert.equal(config.tool_output, undefined);
  for (const relative of USAGE_AUDIT_FILES) assert.ok(existsSync(path.join(project, '.opencode', relative)), relative);
  assert.deepEqual(JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json'))).profiles,
    { compaction: true, toolOutput: false, usageAudit: true });
  assert.equal(run('--project', project, '--tool-output').status, 0);
  assert.deepEqual(configuration(project).tool_output, DEFAULT_TOOL_OUTPUT);
  assert.deepEqual(install({ project }).changes, []);
  const exceptions = fixture(t);
  install({ project: exceptions, noOptimizations: true, compaction: true, usageAudit: true });
  assert.deepEqual(JSON.parse(read(path.join(exceptions, '.opencode/toolkit-manifest.json'))).profiles,
    { compaction: true, toolOutput: false, usageAudit: true });
});

test('format 1 manifests migrate to enabled format 2 profiles and back up the first upgrade', t => {
  const project = fixture(t);
  install({ project });
  const manifestFile = path.join(project, '.opencode/toolkit-manifest.json');
  const configFile = path.join(project, '.opencode/opencode.json');
  const legacy = JSON.parse(read(manifestFile));
  legacy.format = 1; legacy.version = '0.1.0'; delete legacy.profiles; delete legacy.sources; delete legacy.provenance; delete legacy.generatedProfiles; delete legacy.createdParents;
  writeFileSync(manifestFile, `${JSON.stringify(legacy, null, 2)}\n`);
  const config = JSON.parse(read(configFile)); delete config.compaction; delete config.tool_output; delete config.agents.compaction;
  const oldConfig = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(configFile, oldConfig);
  const result = install({ project });
  assert.deepEqual(result.profiles, { compaction: true, toolOutput: true, usageAudit: true });
  const migrated = JSON.parse(read(manifestFile));
  assert.equal(migrated.format, 2); assert.equal(migrated.version, '0.2.0');
  assert.deepEqual(migrated.profiles, { compaction: true, toolOutput: true, usageAudit: true });
  assert.ok(result.backupDirectory);
  assert.equal(JSON.parse(read(path.join(result.backupDirectory, '.opencode/toolkit-manifest.json'))).format, 1);
  assert.equal(read(path.join(result.backupDirectory, '.opencode/opencode.json')), oldConfig);
});

test('JSONC opt-out deletes generated profile fields while preserving unrelated comments', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  const file = path.join(project, '.opencode/opencode.jsonc');
  writeFileSync(file, '{\n // retain this project comment\n "model": "local/model",\n}\n');
  assert.equal(run('--project', project).status, 0);
  const result = run('--project', project, '--no-compaction', '--no-tool-output');
  assert.equal(result.status, 0, result.stderr);
  const content = read(file);
  assert.match(content, /retain this project comment/);
  const config = parseConfig(content, file);
  assert.equal(config.model, 'local/model');
  assert.equal(config.compaction, undefined);
  assert.equal(config.tool_output, undefined);
  assert.equal(config.agents.compaction, undefined);
});

test('opt-out aborts before writes when a generated profile was customized', t => {
  const project = fixture(t); install({ project });
  const configFile = path.join(project, '.opencode/opencode.json');
  const manifestFile = path.join(project, '.opencode/toolkit-manifest.json');
  const config = JSON.parse(read(configFile)); config.compaction.keep.tokens = 12345;
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  const beforeConfig = read(configFile); const beforeManifest = read(manifestFile);
  const backups = path.join(project, '.opencode/.toolkit-backups');
  const before = existsSync(backups) ? readdirSync(backups) : [];
  assert.throws(() => install({ project, compaction: false }), /customized|manual review/i);
  assert.equal(read(configFile), beforeConfig);
  assert.equal(read(manifestFile), beforeManifest);
  assert.deepEqual(existsSync(backups) ? readdirSync(backups) : [], before);
});

test('root optimization keys are reported as conflicts and are not shadowed by local defaults', t => {
  const project = fixture(t); const rootFile = path.join(project, 'opencode.json');
  const rootConfig = {
    compaction: { auto: false }, tool_output: { max_lines: 99, max_bytes: 99 },
    agents: { compaction: { model: 'root/custom-compactor' } },
  };
  const original = JSON.stringify(rootConfig);
  writeFileSync(rootFile, original);
  const result = run('--project', project);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(rootFile), original);
  const local = configuration(project);
  assert.equal(local.compaction, undefined);
  assert.equal(local.tool_output, undefined);
  assert.equal(local.agents.compaction, undefined);
  assert.match(result.stdout, /root config.*compaction|compaction.*root config/i);
  assert.match(result.stdout, /not effective|controls the effective/i);
  const manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
  assert.deepEqual(manifest.profiles, { compaction: true, toolOutput: true, usageAudit: true });
  assert.equal(manifest.sources.compaction, 'root-owned');
  assert.equal(manifest.sources.toolOutput, 'root-owned');
  assert.equal(manifest.provenance.compaction, 'generated');
  assert.equal(manifest.provenance.toolOutput, 'generated');
  assert.deepEqual(install({ project }).changes, []);
});

test('a new root conflict removes matching generated local values and remains idempotent', t => {
  const project = fixture(t); install({ project });
  const rootFile = path.join(project, 'opencode.json');
  writeFileSync(rootFile, JSON.stringify({ compaction: { auto: false }, tool_output: { max_lines: 10, max_bytes: 10 } }));
  const conflicted = install({ project });
  assert.ok(conflicted.rootConflicts.length >= 2);
  const config = configuration(project);
  assert.equal(config.compaction, undefined); assert.equal(config.tool_output, undefined);
  const manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
  assert.equal(manifest.sources.compaction, 'root-owned'); assert.equal(manifest.sources.toolOutput, 'root-owned');
  assert.equal(manifest.generatedProfiles.compaction, null); assert.equal(manifest.generatedProfiles.toolOutput, null);
  assert.deepEqual(install({ project }).changes, []);
});

test('user-managed absence survives a temporary root conflict and root removal', t => {
  for (const [option, configKey, rootValue] of [
    ['compaction', 'compaction', { auto: false }],
    ['toolOutput', 'tool_output', { max_lines: 10, max_bytes: 10 }],
  ]) {
    const project = fixture(t); install({ project });
    const localFile = path.join(project, '.opencode/opencode.json');
    const local = JSON.parse(read(localFile)); delete local[configKey]; writeFileSync(localFile, JSON.stringify(local));
    install({ project });
    let manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
    assert.equal(manifest.sources[option], 'user-managed'); assert.equal(manifest.provenance[option], 'user-managed');
    const rootFile = path.join(project, 'opencode.json'); writeFileSync(rootFile, JSON.stringify({ [configKey]: rootValue }));
    const conflicted = install({ project });
    assert.match(conflicted.rootConflicts.join('\n'), /root config controls the effective value/i);
    manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
    assert.equal(manifest.sources[option], 'root-owned'); assert.equal(manifest.provenance[option], 'user-managed');
    assert.equal(JSON.parse(read(localFile))[configKey], undefined);
    rmSync(rootFile);
    install({ project });
    assert.equal(JSON.parse(read(localFile))[configKey], undefined);
    manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
    assert.equal(manifest.sources[option], 'user-managed'); assert.equal(manifest.provenance[option], 'user-managed');
    assert.equal(manifest.generatedProfiles[option], null);
    assert.deepEqual(install({ project }).changes, []);
  }
});

test('preserved non-empty local values retain precedence over conflicting root values', t => {
  const project = fixture(t); install({ project });
  const localFile = path.join(project, '.opencode/opencode.json');
  const local = JSON.parse(read(localFile)); local.compaction.buffer = '10%'; writeFileSync(localFile, JSON.stringify(local));
  const rootFile = path.join(project, 'opencode.json'); writeFileSync(rootFile, JSON.stringify({ compaction: { auto: false } }));
  const conflicted = install({ project });
  assert.equal(JSON.parse(read(localFile)).compaction.buffer, '10%');
  assert.match(conflicted.rootConflicts.join('\n'), /local \.opencode value retains precedence/i);
  const manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
  assert.equal(manifest.sources.compaction, 'root-owned'); assert.equal(manifest.provenance.compaction, 'user-managed');
  rmSync(rootFile); install({ project });
  assert.equal(JSON.parse(read(localFile)).compaction.buffer, '10%');
});

test('user changes during an active root conflict update provenance for both profiles', t => {
  for (const [option, configKey, rootValue, customValue] of [
    ['compaction', 'compaction', { auto: false }, { auto: true, keep: { tokens: 12000 }, buffer: '10%', background: false }],
    ['toolOutput', 'tool_output', { max_lines: 10, max_bytes: 10 }, { max_lines: 20, max_bytes: 20 }],
  ]) {
    for (const mode of ['customize', 'remove']) {
      const project = fixture(t); install({ project });
      const localFile = path.join(project, '.opencode/opencode.json'); const rootFile = path.join(project, 'opencode.json');
      writeFileSync(rootFile, JSON.stringify({ [configKey]: rootValue }));
      if (mode === 'remove') {
        const initial = JSON.parse(read(localFile)); initial[configKey] = customValue; writeFileSync(localFile, JSON.stringify(initial));
      }
      install({ project });
      const changed = JSON.parse(read(localFile));
      if (mode === 'customize') changed[configKey] = customValue;
      else delete changed[configKey];
      writeFileSync(localFile, JSON.stringify(changed));
      install({ project });
      let manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
      assert.equal(manifest.sources[option], 'root-owned'); assert.equal(manifest.provenance[option], 'user-managed', `${option}:${mode}`);
      if (mode === 'customize') assert.deepEqual(JSON.parse(read(localFile))[configKey], customValue);
      else assert.equal(JSON.parse(read(localFile))[configKey], undefined);
      rmSync(rootFile); install({ project });
      manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
      assert.equal(manifest.sources[option], 'user-managed'); assert.equal(manifest.provenance[option], 'user-managed');
      assert.equal(manifest.generatedProfiles[option], null);
      if (mode === 'customize') assert.deepEqual(JSON.parse(read(localFile))[configKey], customValue);
      else assert.equal(JSON.parse(read(localFile))[configKey], undefined);
    }
  }
});

test('empty-parent creation or removal during root ownership records user-managed intent', t => {
  for (const [option, configKey, rootValue] of [
    ['compaction', 'compaction', { auto: false }],
    ['toolOutput', 'tool_output', { max_lines: 10, max_bytes: 10 }],
  ]) {
    for (const mode of ['create', 'remove']) {
      const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
      const localFile = path.join(project, '.opencode/opencode.jsonc');
      writeFileSync(localFile, '{\n // project comment\n}\n'); install({ project });
      if (mode === 'remove') {
        writeFileSync(localFile, read(localFile).replace(`"${configKey}": {`, `"${configKey}": {\n // retained parent`));
      }
      const rootFile = path.join(project, 'opencode.json'); writeFileSync(rootFile, JSON.stringify({ [configKey]: rootValue }));
      install({ project });
      let manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
      assert.equal(manifest.sources[option], 'root-owned'); assert.equal(manifest.provenance[option], 'generated');
      const local = parseConfig(read(localFile), localFile);
      if (mode === 'create') local[configKey] = {}; else delete local[configKey];
      writeFileSync(localFile, JSON.stringify(local));
      install({ project });
      manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
      assert.equal(manifest.provenance[option], 'user-managed', `${option}:${mode}`);
      rmSync(rootFile); install({ project });
      assert.deepEqual(parseConfig(read(localFile), localFile)[configKey], mode === 'create' ? {} : undefined);
      manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
      assert.equal(manifest.sources[option], 'user-managed'); assert.equal(manifest.generatedProfiles[option], null);
    }
  }
});

test('same-install local deletion plus a new root conflict records user-managed absence', t => {
  for (const [option, configKey, rootValue] of [
    ['compaction', 'compaction', { auto: false }],
    ['toolOutput', 'tool_output', { max_lines: 10, max_bytes: 10 }],
  ]) {
    const project = fixture(t); install({ project });
    const localFile = path.join(project, '.opencode/opencode.json');
    const local = JSON.parse(read(localFile)); delete local[configKey]; writeFileSync(localFile, JSON.stringify(local));
    const rootFile = path.join(project, 'opencode.json'); writeFileSync(rootFile, JSON.stringify({ [configKey]: rootValue }));
    install({ project });
    let manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
    assert.equal(manifest.sources[option], 'root-owned'); assert.equal(manifest.provenance[option], 'user-managed');
    rmSync(rootFile); install({ project });
    assert.equal(JSON.parse(read(localFile))[configKey], undefined);
    manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
    assert.equal(manifest.sources[option], 'user-managed'); assert.equal(manifest.provenance[option], 'user-managed');
    assert.equal(manifest.generatedProfiles[option], null);
  }
});

test('root-owned commented empty parents re-enable only with an explicit positive flag after root removal', t => {
  for (const [option, configKey, rootValue, defaults] of [
    ['compaction', 'compaction', { auto: false }, DEFAULT_COMPACTION],
    ['toolOutput', 'tool_output', { max_lines: 10, max_bytes: 10 }, DEFAULT_TOOL_OUTPUT],
  ]) {
    for (const mode of ['explicit', 'omitted']) {
      const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
      const localFile = path.join(project, '.opencode/opencode.jsonc');
      writeFileSync(localFile, '{\n // project comment\n}\n'); install({ project });
      writeFileSync(localFile, read(localFile).replace(`"${configKey}": {`, `"${configKey}": {\n // retained root parent`));
      const rootFile = path.join(project, 'opencode.json'); writeFileSync(rootFile, JSON.stringify({ [configKey]: rootValue }));
      install({ project });
      assert.deepEqual(parseConfig(read(localFile), localFile)[configKey], {});
      rmSync(rootFile);
      install({ project, ...(mode === 'explicit' ? { [option]: true } : {}) });
      const content = read(localFile);
      assert.match(content, /retained root parent/);
      const config = parseConfig(content, localFile);
      const manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
      if (mode === 'explicit') {
        assert.deepEqual(config[configKey], defaults);
        assert.equal(manifest.sources[option], 'generated'); assert.deepEqual(manifest.generatedProfiles[option], defaults);
      } else {
        assert.deepEqual(config[configKey], {});
        assert.equal(manifest.sources[option], 'user-managed'); assert.equal(manifest.generatedProfiles[option], null);
      }
    }
  }
});

test('dry-run reports optimization state without writing and model switches leave compaction routing unchanged', t => {
  const parent = fixture(t); const missing = path.join(parent, 'missing');
  const dry = run('--project', missing, '--dry-run', '--no-optimizations');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /compaction disabled; tool output disabled; usage audit disabled/);
  assert.equal(existsSync(missing), false);
  const project = fixture(t);
  install({ project, codingModel: 'vendor/coder-one' });
  assert.equal(configuration(project).agents.compaction, undefined);
  install({ project, codingModel: 'vendor/coder-two' });
  assert.equal(configuration(project).agents.compaction, undefined);
  assert.deepEqual(configuration(project).compaction, DEFAULT_COMPACTION);
  assert.deepEqual(install({ project }).changes, []);
});

test('usage lifecycle drops hashes, preserves customized files, and requires explicit adoption to re-enable', t => {
  const project = fixture(t); install({ project });
  const customized = path.join(project, '.opencode/tools/usage-audit.mjs');
  writeFileSync(customized, '// user customization\n');
  const result = install({ project, usageAudit: false });
  assert.equal(read(customized), '// user customization\n');
  assert.ok(result.optimizationNotices.some(notice => /(?:preserved|skipped).*usage-audit\.mjs|usage-audit\.mjs.*(?:preserved|skipped)/i.test(notice)));
  for (const relative of USAGE_AUDIT_FILES.filter(file => file !== 'tools/usage-audit.mjs')) {
    assert.equal(existsSync(path.join(project, '.opencode', relative)), false, relative);
  }
  const disabled = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
  assert.equal(disabled.sources.usageAudit, 'disabled');
  for (const relative of USAGE_AUDIT_FILES) assert.equal(Object.hasOwn(disabled.files, relative), false, relative);
  assert.throws(() => install({ project, usageAudit: true }), /explicit adoption/i);
  const adopted = install({ project, usageAudit: true, adoptUsageAudit: true });
  assert.notEqual(read(customized), '// user customization\n');
  assert.equal(read(path.join(adopted.backupDirectory, '.opencode/tools/usage-audit.mjs')), '// user customization\n');
  const enabled = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
  assert.equal(enabled.sources.usageAudit, 'generated');
  for (const relative of USAGE_AUDIT_FILES) assert.ok(Object.hasOwn(enabled.files, relative), relative);
  assert.deepEqual(install({ project }).changes, []);
});

test('every pre-existing usage artifact collides before writes unless explicitly adopted', t => {
  for (const relative of USAGE_AUDIT_FILES) {
    const project = fixture(t); const file = path.join(project, '.opencode', relative);
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `unmanaged ${relative}`);
    assert.throws(() => install({ project }), /explicit adoption/i, relative);
    assert.equal(read(file), `unmanaged ${relative}`);
    assert.equal(existsSync(path.join(project, '.opencode/toolkit-manifest.json')), false, relative);
    const adopted = install({ project, adoptUsageAudit: true });
    assert.equal(read(path.join(adopted.backupDirectory, '.opencode', relative)), `unmanaged ${relative}`, relative);
  }
});

test('legacy singular usage command uses collision, adoption, backup, removal, and duplicate prevention', t => {
  const legacy = 'command/usage-audit.md'; const plural = 'commands/usage-audit.md';
  const project = fixture(t);
  for (const relative of [legacy, plural]) {
    const file = path.join(project, '.opencode', relative);
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `unmanaged ${relative}`);
  }
  assert.throws(() => install({ project }), /explicit adoption/i);
  assert.equal(existsSync(path.join(project, '.opencode/toolkit-manifest.json')), false);
  const adopted = install({ project, adoptUsageAudit: true });
  assert.equal(existsSync(path.join(project, '.opencode', legacy)), false);
  assert.ok(existsSync(path.join(project, '.opencode', plural)));
  assert.equal(read(path.join(adopted.backupDirectory, '.opencode', legacy)), `unmanaged ${legacy}`);
  assert.equal(read(path.join(adopted.backupDirectory, '.opencode', plural)), `unmanaged ${plural}`);
  assert.equal(adopted.changes.filter(file => file === `.opencode/${legacy}`).length, 1);
  install({ project, usageAudit: false });
  assert.equal(existsSync(path.join(project, '.opencode', plural)), false);
  const legacyFile = path.join(project, '.opencode', legacy);
  mkdirSync(path.dirname(legacyFile), { recursive: true }); writeFileSync(legacyFile, 'late unmanaged legacy');
  assert.throws(() => install({ project, usageAudit: true }), /explicit adoption/i);
  const readopted = install({ project, usageAudit: true, adoptUsageAudit: true });
  assert.equal(existsSync(legacyFile), false);
  assert.equal(read(path.join(readopted.backupDirectory, '.opencode', legacy)), 'late unmanaged legacy');
  assert.deepEqual(install({ project }).changes, []);
});

test('missing or different generated values become user-managed instead of being reclaimed', t => {
  const removed = fixture(t); install({ project: removed });
  const removedConfig = configuration(removed); delete removedConfig.compaction;
  writeFileSync(path.join(removed, '.opencode/opencode.json'), JSON.stringify(removedConfig));
  install({ project: removed });
  assert.equal(configuration(removed).compaction, undefined);
  let manifest = JSON.parse(read(path.join(removed, '.opencode/toolkit-manifest.json')));
  assert.equal(manifest.sources.compaction, 'user-managed'); assert.equal(manifest.generatedProfiles.compaction, null);

  const changed = fixture(t); install({ project: changed });
  const changedConfig = configuration(changed); changedConfig.compaction.buffer = '10%';
  writeFileSync(path.join(changed, '.opencode/opencode.json'), JSON.stringify(changedConfig));
  install({ project: changed });
  assert.equal(configuration(changed).compaction.buffer, '10%');
  manifest = JSON.parse(read(path.join(changed, '.opencode/toolkit-manifest.json')));
  assert.equal(manifest.sources.compaction, 'user-managed'); assert.equal(manifest.generatedProfiles.compaction, null);
  install({ project: changed, compaction: false });
  assert.equal(configuration(changed).compaction.buffer, '10%');
});

test('format 2 manifests reject unknown, missing, malformed, and inconsistent ownership state before writes', t => {
  const invalid = [
    value => { value.unexpected = true; },
    value => { delete value.sources; },
    value => { delete value.provenance; },
    value => { value.provenance.compaction = 'generated'; value.sources.compaction = 'user-managed'; },
    value => { value.profiles.compaction = 'yes'; },
    value => { value.generatedProfiles.compaction = { auto: true }; },
    value => { value.sources.compaction = 'generated'; value.generatedProfiles.compaction = null; },
    value => { value.profiles.compaction = false; value.sources.compaction = 'generated'; },
    value => { value.profiles.usageAudit = false; value.sources.usageAudit = 'disabled'; },
    value => { value.createdParents = [['compaction'], ['compaction']]; },
  ];
  for (const mutate of invalid) {
    const project = fixture(t); install({ project });
    const file = path.join(project, '.opencode/toolkit-manifest.json'); const manifest = JSON.parse(read(file)); mutate(manifest);
    const original = `${JSON.stringify(manifest, null, 2)}\n`; writeFileSync(file, original);
    assert.throws(() => install({ project }), /manifest|profile|ownership|state|source|disabled|createdParents|usage audit/i);
    assert.equal(read(file), original);
  }
});

test('format 1 manifests reject format-2-only state before migration or writes', t => {
  for (const field of ['profiles', 'sources', 'provenance', 'generatedProfiles', 'createdParents']) {
    const project = fixture(t); install({ project });
    const file = path.join(project, '.opencode/toolkit-manifest.json'); const current = JSON.parse(read(file));
    const legacy = {
      format: 1, version: '0.1.0', models: current.models, files: current.files, config: current.config,
      inheritedPermissions: current.inheritedPermissions, localPermissions: current.localPermissions, mergedPermissions: current.mergedPermissions,
      [field]: 'malformed',
    };
    const original = `${JSON.stringify(legacy, null, 2)}\n`; writeFileSync(file, original);
    assert.throws(() => install({ project }), /format-2-only/i, field);
    assert.equal(read(file), original, field);
  }
});

test('pre-existing values equal to defaults remain user-managed without a prior generated snapshot', t => {
  const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
  writeFileSync(path.join(project, '.opencode/opencode.json'), JSON.stringify({ compaction: DEFAULT_COMPACTION, tool_output: DEFAULT_TOOL_OUTPUT }));
  install({ project });
  const manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
  assert.equal(manifest.sources.compaction, 'user-managed'); assert.equal(manifest.sources.toolOutput, 'user-managed');
  assert.equal(manifest.generatedProfiles.compaction, null); assert.equal(manifest.generatedProfiles.toolOutput, null);
  assert.deepEqual(configuration(project).compaction, DEFAULT_COMPACTION);
});

test('commented generated JSONC parents survive opt-out and restore defaults on positive re-enable', t => {
  for (const [option, configKey, defaults] of [
    ['compaction', 'compaction', DEFAULT_COMPACTION],
    ['toolOutput', 'tool_output', DEFAULT_TOOL_OUTPUT],
  ]) {
    const project = fixture(t); mkdirSync(path.join(project, '.opencode'));
    const file = path.join(project, '.opencode/opencode.jsonc');
    writeFileSync(file, '{\n // project comment\n}\n');
    install({ project });
    const config = read(file).replace(`"${configKey}": {`, `"${configKey}": {\n    // keep ${configKey} comment`);
    assert.match(config, new RegExp(`keep ${configKey} comment`));
    writeFileSync(file, config);
    install({ project, [option]: false });
    const disabled = read(file);
    assert.match(disabled, new RegExp(`keep ${configKey} comment`));
    assert.deepEqual(parseConfig(disabled, file)[configKey], {});
    let manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
    assert.ok(manifest.createdParents.some(parent => JSON.stringify(parent) === JSON.stringify([configKey])));
    assert.equal(manifest.sources[option], 'disabled');
    install({ project, [option]: true });
    const enabled = read(file);
    assert.match(enabled, new RegExp(`keep ${configKey} comment`));
    assert.deepEqual(parseConfig(enabled, file)[configKey], defaults);
    manifest = JSON.parse(read(path.join(project, '.opencode/toolkit-manifest.json')));
    assert.equal(manifest.sources[option], 'generated');
    assert.deepEqual(manifest.generatedProfiles[option], defaults);
    assert.deepEqual(install({ project }).changes, []);
  }
});

test('package and export carry version 0.2.0, attribution allowlist, usage audit, and refreshed local tools', () => {
  const pkg = JSON.parse(read(path.join(root, 'package.json')));
  const lock = JSON.parse(read(path.join(root, 'package-lock.json')));
  assert.equal(pkg.version, '0.2.0'); assert.equal(lock.version, '0.2.0'); assert.equal(lock.packages[''].version, '0.2.0');
  for (const file of ['ATTRIBUTION.md', 'CHANGELOG.md', 'docs/']) assert.ok(pkg.files.includes(file), file);
  const exporter = read(path.join(root, 'scripts/export.mjs'));
  for (const name of ['usage-audit', 'context-tools.mjs', 'context-tools.md', 'context-tools.test.mjs', 'plan-first.test.mjs', 'rtk.md', 'rtk-install.md']) {
    assert.ok(exporter.includes(name), name);
  }
});
