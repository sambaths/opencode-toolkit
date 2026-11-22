import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(path.join(root, 'opencode.json'), 'utf8'));
const agents = readdirSync(path.join(root, 'agents')).filter(f => f.endsWith('.md'));
const read = name => readFileSync(path.join(root, name), 'utf8');
const rules = text => [...text.matchAll(/- action:\s*["']?([^\n"']+)["']?\n\s+resource:\s*(.+)\n\s+effect:\s*["']?([^\n"']+)/g)]
  .map(m => m.slice(1).map(s => s.trim().replace(/^["']|["']$/g, '')));

test('shared shell baseline with consequential operations requiring approval', () => {
  assert.ok(config.permissions.some(r => r.action === 'shell' && r.resource === '*' && r.effect === 'allow'));
  for (const command of ['git push *', 'git reset *', 'rm *']) {
    assert.ok(config.permissions.some(r => r.action === 'shell' && r.resource === command && r.effect === 'ask'), command);
  }
});

test('agents inherit shell policy without wildcard overrides or duplicate matchers', () => {
  for (const file of agents) {
    const parsed = rules(read(`agents/${file}`).split('---')[1]);
    const seen = new Set();
    for (const [action, resource] of parsed) {
      const key = `${action}:${resource}`;
      assert.ok(!seen.has(key), `${file}: duplicate ${key}`);
      seen.add(key);
      assert.notEqual(action, '*', `${file}: wildcard overrides shared safeguards`);
      assert.notEqual(action, 'shell', `${file}: shell policy belongs in shared config`);
    }
  }
});

test('agents and commands each have one authoritative definition', () => {
  for (const file of agents) assert.ok(!config.agents?.[file.slice(0, -3)], file);
  assert.equal(Object.keys(config.commands ?? {}).length, 0);
});

test('manager can inspect, review routes consistently, delegation is shallow', () => {
  const manager = rules(read('agents/manager.md').split('---')[1]);
  assert.ok(!manager.some(([a, , effect]) => ['read', 'glob', 'grep'].includes(a) && effect === 'deny'));
  assert.match(read('commands/code-review.md'), /agent: reviewer\n/);
  assert.equal(config.experimental.subagent_depth, 1);
  for (const file of agents.filter(f => !['manager.md', 'moderator.md'].includes(f))) {
    assert.ok(!rules(read(`agents/${file}`).split('---')[1]).some(([a, , e]) => a === 'subagent' && e === 'allow'), file);
  }
});

test('repaired commands do not depend on missing scripts or arbitrary thresholds', () => {
  assert.doesNotMatch(read('commands/harness-audit.md'), /node scripts\/harness-audit\.js/);
  assert.doesNotMatch(read('commands/setup-pm.md'), /node scripts\/setup-package-manager\.js/);
  assert.match(read('commands/skill-create.md'), /\.opencode\/tools\/evaluate-skill\.mjs/);
  assert.doesNotMatch(read('commands/rust-test.md'), /--fail-under-lines 80/);
  assert.doesNotMatch(read('commands/code-review.md'), /Functions > 50|Files > 800/);
});

test('bounded opt-in learning and council handoff are explicit prompt contracts, not live model evals', () => {
  const optimizer = read('prompts/agents/harness-optimizer.txt');
  assert.doesNotMatch(optimizer, /overall_score|category score deltas|collect baseline score/);
  assert.match(optimizer, /stop after evaluation unless implementation is separately authorized/);
  for (const file of ['agents/manager.md', 'prompts/agents/loop-operator.txt']) {
    assert.match(read(file), /two checkpoints without progress/);
    assert.match(read(file), /untrusted evidence/);
    assert.match(read(file), /task-state\.md/);
  }
  assert.match(read('agents/moderator.md'), /does not automatically restore manager/);
  assert.match(read('commands/council.md'), /\/orchestrate <next task>/);
});

test('task triage preserves unfinished work and asks only for consequential competing priorities (static contract)', () => {
  const manager = read('agents/manager.md');
  for (const phrase of ['continuation/correction/retry', 'in-scope extension', 'related branch', 'unrelated task', 'finish current then queue', 'checkpoint/pause then switch', 'independent parallel', 'cancel current', 'already-running', 'verified acceptance', 'tasks']) assert.ok(manager.includes(phrase), phrase);
  assert.match(manager, /[Tt]ry now/);
  assert.match(manager, /cancelled work/);
  assert.match(manager, /budget.*reset|reset.*budget/);
  assert.match(read('commands/orchestrate.md'), /task triage/i);
});
