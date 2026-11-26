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

test('harness audit explicitly covers cache compatibility, Code Mode, compaction, output caps, warming, and RTK boundaries', () => {
  const command = read('commands/harness-audit.md');
  for (const phrase of [
    "compatibility.cacheFormat: 'anthropic'", 'codemode: false', 'agents.compaction.model', 'keep.tokens',
    'background', 'tool_output.max_lines', 'tool_output.max_bytes', 'Warming cost', 'different permission resource',
    'does not force a compaction model', 'experimental.location_idle_timeout', 'local `.opencode` value retains precedence', '**static**', '**runtime evidence**',
  ]) assert.ok(command.includes(phrase), phrase);
  for (const url of [
    'https://opencode.ai/v2/docs/models', 'https://opencode.ai/v2/docs/config',
    'https://opencode.ai/v2/docs/mcp-servers', 'https://opencode.ai/v2/docs/compaction',
    'https://github.com/pleasedodisturb/awesome-llm-token-optimization',
  ]) assert.ok(command.includes(url), url);
  for (const url of ['https://opencode.ai/changelog', 'https://opencode.ai/changelog/v2.4.1', 'https://opencode.ai/changelog/v2.4.0',
    'https://opencode.ai/changelog/v2.3.2', 'https://opencode.ai/changelog/v2.3.1', 'https://opencode.ai/v2/docs/api',
    'https://opencode.ai/v2/openapi.json', 'https://opencode.ai/v2/docs/config#worktrees', 'https://opencode.ai/v2/docs/tools#worktrees']) {
    assert.ok(command.includes(url), url);
  }
  for (const url of ['/v2/docs/automations', '/v2/docs/background-jobs', '/v2/docs/session-inbox', '/v2/docs/worktrees']) assert.ok(!command.includes(url), url);
  for (const phrase of ['timed-out shell commands', 'webfetch', 'newest protocol', 'GPT-6.2', 'plugin automation API',
    'full_codemode', 'model_speeds', 'configDir', 'version-range auto-updates', 'background compaction', 'strict unattended profile is roadmap only']) {
    assert.ok(command.includes(phrase), phrase);
  }
});

test('export definition-path checks are segment-aware on Windows and POSIX', () => {
  const exporter = readFileSync(path.join(root, '../scripts/export.mjs'), 'utf8');
  assert.match(exporter, /function isDefinitionPath[\s\S]*?relative\.split\(path\.sep\)/);
  assert.doesNotMatch(exporter, /relative\.startsWith\('agents\/'\)|relative\.startsWith\('commands\/'\)/);
});

test('usage audit command and guide cite the V2 API contract and preserve the privacy boundary', () => {
  const command = read('commands/usage-audit.md');
  const guide = read('tools/usage-audit.md');
  assert.match(command, /\.opencode\/tools\/usage-audit\.md/);
  assert.match(command, /node \.opencode\/tools\/usage-audit\.mjs/);
  for (const url of [
    'https://opencode.ai/v2/docs/cli/commands#api', 'https://opencode.ai/v2/docs/api#tag-session',
    'https://opencode.ai/v2/openapi.json',
  ]) assert.ok(guide.includes(url), url);
  assert.match(guide, /never replaces missing values with zero/);
  assert.match(guide, /Prompts, message content|transcripts, titles, message content/);
  assert.match(guide, /GET \/api\/location/);
  assert.match(guide, /may start the OpenCode service or use its configured remote server/);
  assert.match(guide, /aggregate report metadata in that agent's current model context/);
});
