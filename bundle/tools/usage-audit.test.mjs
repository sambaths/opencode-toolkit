import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createRunner, main, parseArgs, renderUsage, usageAudit } from './usage-audit.mjs';

const script = fileURLToPath(new URL('./usage-audit.mjs', import.meta.url));
const now = Date.UTC(2026, 10, 25, 12, 0, 0);
const tokens = (input, output, reasoning, read, write) => ({ input, output, reasoning, cache: { read, write } });
const totals = (calls, succeeded, failed, unfinished) => ({ calls, succeeded, failed, unfinished });
const fixtureStats = () => ({
  range: { from: now - 7 * 86400000, to: now },
  sessions: 4, subagents: 2, prompts: 9, steps: 12,
  tokens: tokens(100, 20, 5, 30, 10), cost: 1.25,
  tools: {
    mode: 'detail', totals: totals(8, 6, 1, 1),
    usage: [
      { name: 'read', ...totals(5, 5, 0, 0), durationP50: 12 },
      { name: 'shell', ...totals(3, 1, 1, 1), durationP50: 20 },
    ],
  },
  activeDays: 2, streak: 1,
  activity: [{ prompt: 'PRIVATE PROMPT MUST NOT BE RENDERED', secret: 'PRIVATE SECRET MUST NOT BE RENDERED' }],
  models: [
    { model: { providerID: 'vendor', id: 'coder', variant: 'fast' }, steps: 8, tokens: tokens(60, 10, 5, 20, 10), cost: 1 },
    { model: { providerID: 'vendor', id: 'coder', variant: 'fast' }, steps: 2, tokens: tokens(20, 5, 0, 5, 0), cost: 0.25 },
    { model: { providerID: 'other', id: 'reviewer' }, steps: 2, tokens: tokens(20, 5, 0, 5, 0), cost: 0 },
  ],
});

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'usage-audit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function runnerFor(root, stats = fixtureStats(), projects = [{ id: 'project-id', canonical: root }]) {
  const calls = [];
  return {
    calls,
    runner: async (args, options) => {
      calls.push({ args, options });
      if (args[1] === 'location.get') {
        return { stdout: JSON.stringify({ directory: root, project: { id: projects[0]?.id ?? 'project-id', directory: root, canonical: root } }), stderr: '', code: 0 };
      }
      if (args[2] === '/api/project') return { stdout: JSON.stringify(projects), stderr: '', code: 0 };
      assert.equal(args[2], '/api/experimental/session/stats');
      return { stdout: JSON.stringify({ data: stats }), stderr: '', code: 0 };
    },
  };
}

test('argument parsing validates every documented option', () => {
  assert.deepEqual(parseArgs([], now), { root: process.cwd(), days: 7, format: 'markdown', tools: 'summary', timezone: 'UTC', now });
  assert.deepEqual(parseArgs(['--root', 'project', '--days', '3', '--format', 'json', '--tools', 'detail', '--timezone', 'America/New_York'], now), {
    root: path.resolve('project'), days: 3, format: 'json', tools: 'detail', timezone: 'America/New_York', now,
  });
  for (const args of [
    ['--days', '0'], ['--days', '3651'], ['--days', 'x'], ['--format', 'yaml'], ['--tools', 'all'],
    ['--timezone', 'Not/AZone'], ['--root'], ['--days', '1', '--days', '2'], ['--unknown'], ['positional'],
  ]) assert.throws(() => parseArgs(args, now), /usage|must|missing|unknown|unexpected|duplicate|timezone/i, args.join(' '));
  assert.equal(parseArgs(['--help'], now).help, true);
});

test('canonical project resolution and stats request use argv parameters without shell interpolation', async t => {
  const parent = fixture(t); const root = path.join(parent, 'project'); const link = path.join(parent, 'link');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(root); symlinkSync(root, link, 'dir');
  const transport = runnerFor(root);
  const report = await usageAudit({ root: link, days: 7, tools: 'detail', timezone: 'UTC', now, runner: transport.runner });
  assert.equal(report.project.root, root);
  assert.equal(report.project.id, 'project-id');
  assert.deepEqual(transport.calls[0].args, ['api', 'location.get', '--param', `location[directory]=${root}`]);
  const statsArgs = transport.calls[1].args;
  assert.deepEqual(statsArgs.slice(0, 3), ['api', 'GET', '/api/experimental/session/stats']);
  const params = Object.fromEntries(statsArgs.filter((_, index) => statsArgs[index - 1] === '--param').map(value => {
    const split = value.indexOf('='); return [value.slice(0, split), value.slice(split + 1)];
  }));
  assert.deepEqual(params, {
    project: 'project-id', from: String(now - 7 * 86400000), to: String(now), timezone: 'UTC', tools: 'detail',
  });
  assert.equal(transport.calls[0].options.shell, false);
  assert.equal(transport.calls[1].options.shell, false);
});

test('location fallback is strict and stats are never requested for zero, multiple, or mismatched projects', async t => {
  const root = fixture(t); const stats = fixtureStats();
  for (const projects of [[], [{ id: 'one', canonical: root }, { id: 'two', canonical: root }]]) {
    const calls = [];
    const runner = async args => {
      calls.push(args);
      if (args[1] === 'location.get') return { stdout: '', stderr: '', code: 1 };
      if (args[2] === '/api/project') return { stdout: JSON.stringify(projects), stderr: '', code: 0 };
      return { stdout: JSON.stringify({ data: stats }), stderr: '', code: 0 };
    };
    await assert.rejects(usageAudit({ root, now, runner }), /not registered|ambiguous/i);
    assert.equal(calls.some(args => args[2] === '/api/experimental/session/stats'), false);
  }
  const calls = []; const canary = 'CANARY_LOCATION_CANONICAL_DO_NOT_RENDER';
  const mismatch = await usageAudit({ root, now, runner: async args => {
    calls.push(args);
    return { stdout: JSON.stringify({ directory: root, project: { id: 'wrong', directory: root, canonical: canary } }), stderr: '', code: 0 };
  } }).then(() => null, error => error);
  assert.match(mismatch.message, /different canonical project/i);
  assert.doesNotMatch(mismatch.message, /CANARY_LOCATION_CANONICAL_DO_NOT_RENDER/);
  assert.equal(calls.length, 1);
});

test('aggregation emits only tokens, cost, models, and requested tool detail', async t => {
  const root = fixture(t); const transport = runnerFor(root);
  const report = await usageAudit({ root, days: 7, tools: 'detail', timezone: 'UTC', now, runner: transport.runner });
  assert.deepEqual(report.tokens, tokens(100, 20, 5, 30, 10));
  assert.equal(report.cost, 1.25);
  assert.deepEqual(report.models, [
    { model: { providerID: 'vendor', id: 'coder', variant: 'fast' }, tokens: tokens(80, 15, 5, 25, 10), cost: 1.25 },
    { model: { providerID: 'other', id: 'reviewer' }, tokens: tokens(20, 5, 0, 5, 0), cost: 0 },
  ]);
  assert.deepEqual(report.tools, fixtureStats().tools);
  assert.equal(report.truncation.complete, true);
  for (const rendered of [JSON.stringify(report), renderUsage(report, 'json'), renderUsage(report, 'markdown')]) {
    assert.doesNotMatch(rendered, /PRIVATE PROMPT|PRIVATE SECRET|sessions|subagents|prompts|steps|activity|streak/);
  }
});

test('none and summary tool modes are preserved without invented detail', async t => {
  const root = fixture(t);
  for (const tools of [{ mode: 'none' }, { mode: 'summary', totals: totals(0, 0, 0, 0) }]) {
    const stats = fixtureStats(); stats.tools = tools;
    const transport = runnerFor(root, stats);
    const report = await usageAudit({ root, tools: tools.mode, timezone: 'UTC', now, runner: transport.runner });
    assert.deepEqual(report.tools, tools);
  }
});

test('missing CLI, API failure, malformed JSON, missing project, and malformed stats fail clearly', async t => {
  const root = fixture(t);
  await assert.rejects(usageAudit({ root, now, runner: async () => { throw Object.assign(new Error('spawn opencode ENOENT'), { code: 'ENOENT' }); } }), /OpenCode CLI.*not found|missing.*opencode/i);
  await assert.rejects(usageAudit({ root, now, runner: async () => ({ stdout: '', stderr: 'PRIVATE SECRET', code: 3 }) }), /exit code 3/);
  const apiError = await usageAudit({ root, now, runner: async () => ({ stdout: '', stderr: 'PRIVATE SECRET', code: 3 }) }).then(() => null, error => error);
  assert.doesNotMatch(apiError.message, /PRIVATE SECRET/);
  await assert.rejects(usageAudit({ root, now, runner: async () => ({ stdout: '{broken', stderr: '', code: 0 }) }), /malformed JSON/i);
  const missingProject = async args => args[1] === 'location.get'
    ? { stdout: '', stderr: '', code: 1 }
    : { stdout: '[]', stderr: '', code: 0 };
  await assert.rejects(usageAudit({ root, now, runner: missingProject }), /project.*not (found|registered)|not registered/i);
  const malformed = fixtureStats(); delete malformed.tokens.input;
  await assert.rejects(usageAudit({ root, tools: 'detail', now, runner: runnerFor(root, malformed).runner }), /malformed usage data|invalid.*input/i);
  const wrongMode = fixtureStats(); wrongMode.tools.mode = 'none';
  await assert.rejects(usageAudit({ root, tools: 'detail', now, runner: runnerFor(root, wrongMode).runner }), /tool mode|malformed.*tools/i);
});

test('stats response range must exactly match the requested range', async t => {
  const root = fixture(t); const stats = fixtureStats(); stats.range.from += 1;
  const error = await usageAudit({ root, days: 7, now, runner: runnerFor(root, stats).runner }).then(() => null, failure => failure);
  assert.match(error.message, /response range does not match/i);
  assert.doesNotMatch(error.message, /CANARY_RANGE/);
});

test('canonical roots reject controls and Markdown labels escape backticks', async t => {
  const parent = fixture(t);
  for (const control of ['\n', '\u001b', '\u061c', '\u200e', '\u200f']) {
    const root = path.join(parent, `bad${control}name`); mkdirSync(root);
    await assert.rejects(usageAudit({ root, now, runner: async () => { throw new Error('must not call'); } }), /control characters/i);
  }
  const root = path.join(parent, 'project`canary'); mkdirSync(root);
  const stats = fixtureStats(); stats.models[0].model.id = 'model`canary'; stats.tools.usage[0].name = 'tool`canary';
  const report = await usageAudit({ root, tools: 'detail', now, runner: runnerFor(root, stats).runner });
  const markdown = renderUsage(report, 'markdown');
  assert.match(markdown, /project\\`canary/);
  assert.match(markdown, /model\\`canary/);
  assert.match(markdown, /tool\\`canary/);
  assert.equal(markdown.includes('\u001b'), false);
});

test('model and tool labels reject terminal control canaries without echoing them', async t => {
  const root = fixture(t);
  for (const field of ['model', 'tool']) for (const control of ['\u001b', '\u061c', '\u200e', '\u200f']) {
    const stats = fixtureStats(); const canary = `CANARY_${field}${control}[31m`;
    if (field === 'model') stats.models[0].model.id = canary;
    else stats.tools.usage[0].name = canary;
    const error = await usageAudit({ root, tools: 'detail', now, runner: runnerFor(root, stats).runner }).then(() => null, failure => failure);
    assert.match(error.message, /invalid model id|invalid tool name/i);
    assert.equal(error.message.includes(canary), false);
    assert.equal(error.message.includes(control), false);
  }
});

test('response bytes and timeout are bounded and active requests are aborted', async t => {
  const root = fixture(t);
  await assert.rejects(usageAudit({ root, now, maxResponseBytes: 8, runner: async () => ({ stdout: 'x'.repeat(100), stderr: '', code: 0 }) }), /response.*limit|too large/i);
  await assert.rejects(usageAudit({
    root, now, timeoutMs: 10,
    runner: async (_args, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' })), { once: true });
    }),
  }), /timed out/i);
});

test('pre-aborted signals reject before runner invocation or child spawn', async t => {
  const controller = new AbortController(); controller.abort();
  let spawns = 0;
  const runner = createRunner({ spawnImpl: () => { spawns++; throw new Error('must not spawn'); } });
  await assert.rejects(runner(['api', 'GET', '/api/project'], { signal: controller.signal, maxBytes: 10 }), error => error.code === 'ABORT_ERR');
  assert.equal(spawns, 0);
  const root = fixture(t); let calls = 0;
  await assert.rejects(usageAudit({ root, now, interruptSignal: controller.signal, runner: async () => { calls++; } }), error => error.code === 'INTERRUPTED');
  assert.equal(calls, 0);
});

test('oversized response terminates a SIGTERM-ignoring child with SIGKILL and unrefs handles', async () => {
  class FakeChild extends EventEmitter {
    constructor() {
      super(); this.stdout = new EventEmitter(); this.stderr = new EventEmitter();
      this.stdout.unref = () => { this.stdoutUnrefed = true; };
      this.stderr.unref = () => { this.stderrUnrefed = true; };
      this.kills = []; this.unrefed = false;
    }
    kill(signal) {
      this.kills.push(signal);
      if (signal === 'SIGKILL') this.emit('close', null);
      return true;
    }
    unref() { this.unrefed = true; }
  }
  const child = new FakeChild(); let spawnOptions;
  const runner = createRunner({
    spawnImpl: (_command, _args, options) => { spawnOptions = options; return child; }, killGraceMs: 5,
    signalTree: (_child, signal) => { child.kills.push(signal); if (signal === 'SIGKILL') child.emit('close', null); },
  });
  const pending = runner(['api', 'GET', '/api/project'], { signal: new AbortController().signal, maxBytes: 4 });
  child.stdout.emit('data', Buffer.alloc(5));
  await assert.rejects(pending, error => error.code === 'RESPONSE_LIMIT');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(child.kills, ['SIGTERM', 'SIGKILL']);
  assert.equal(child.unrefed, true); assert.equal(child.stdoutUnrefed, true); assert.equal(child.stderrUnrefed, true);
  assert.equal(spawnOptions.shell, false);
  if (process.platform !== 'win32') assert.equal(spawnOptions.detached, true);
});

test('confirmed child close clears the grace timer without a stale SIGKILL', async () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdout.unref = () => {}; child.stderr.unref = () => {}; child.unref = () => {}; child.kills = [];
  const runner = createRunner({
    spawnImpl: () => child, killGraceMs: 5,
    signalTree: (_child, signal) => { child.kills.push(signal); if (signal === 'SIGTERM') child.emit('close', null); },
  });
  const pending = runner(['api', 'GET', '/api/project'], { signal: new AbortController().signal, maxBytes: 1 });
  child.stdout.emit('data', Buffer.alloc(2));
  await assert.rejects(pending, error => error.code === 'RESPONSE_LIMIT');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(child.kills, ['SIGTERM']);
});

test('Windows taskkill success is scoped per run and later failure still falls back', async () => {
  const makeChild = pid => {
    const child = new EventEmitter(); child.pid = pid; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdout.unref = () => {}; child.stderr.unref = () => {}; child.unref = () => {}; child.kills = [];
    child.kill = signal => { child.kills.push(signal); child.emit('close', null); return true; };
    return child;
  };
  const first = makeChild(101); const second = makeChild(202); const children = [first, second];
  let taskkillCalls = 0; const warnings = [];
  const runner = createRunner({
    platform: 'win32', killGraceMs: 5,
    spawnImpl: () => children[taskkillCalls === 0 ? 0 : 1],
    taskkillImpl: () => {
      const code = taskkillCalls++ === 0 ? 0 : 1;
      const killer = new EventEmitter(); killer.unref = () => {};
      queueMicrotask(() => killer.emit('close', code));
      return killer;
    },
    onCleanupWarning: message => warnings.push(message),
  });
  const firstPending = runner(['api', 'GET', '/api/project'], { signal: new AbortController().signal, maxBytes: 1 });
  first.stdout.emit('data', Buffer.alloc(2));
  await assert.rejects(firstPending, error => error.code === 'RESPONSE_LIMIT');
  await new Promise(resolve => setTimeout(resolve, 10));
  first.emit('close', null);
  const secondPending = runner(['api', 'GET', '/api/project'], { signal: new AbortController().signal, maxBytes: 1 });
  second.stdout.emit('data', Buffer.alloc(2));
  await assert.rejects(secondPending, error => error.code === 'RESPONSE_LIMIT');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(taskkillCalls >= 2);
  assert.ok(second.kills.includes('SIGTERM'));
  assert.ok(warnings.length >= 1);
});

test('main SIGINT handler aborts the active runner and removes signal listeners', async t => {
  const root = fixture(t); const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdout.unref = () => {}; child.stderr.unref = () => {}; child.unref = () => {}; child.kills = [];
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const runner = createRunner({
    spawnImpl: () => { markStarted(); return child; }, killGraceMs: 5,
    signalTree: (_child, signal) => { child.kills.push(signal); if (signal === 'SIGTERM') child.emit('close', null); },
  });
  const signalTarget = new EventEmitter(); const errors = [];
  const pending = main(['--root', root, '--timezone', 'UTC'], {
    now, runner, signalTarget, error: line => errors.push(line), log: () => {},
  });
  await started;
  signalTarget.emit('SIGINT');
  const code = await pending;
  assert.equal(code, 130, errors.join('\n'));
  assert.deepEqual(child.kills, ['SIGTERM']);
  assert.equal(signalTarget.listenerCount('SIGINT'), 0); assert.equal(signalTarget.listenerCount('SIGTERM'), 0);
  assert.match(errors.join('\n'), /interrupted by SIGINT/);
});

test('POSIX response-limit cleanup kills a detached grandchild process group', { skip: process.platform === 'win32' }, async () => {
  const script = `
    const { spawn } = require('node:child_process');
    const grandchild = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    process.send({ grandchild: grandchild.pid });
    process.on('SIGTERM', () => {});
    process.stdout.write('12345');
    setInterval(() => {}, 1000);
  `;
  let child;
  const runner = createRunner({
    killGraceMs: 100,
    spawnImpl: (_command, _args, options) => {
      child = spawn(process.execPath, ['-e', script], { ...options, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      return child;
    },
  });
  const pending = runner(['api', 'GET', '/api/project'], { signal: new AbortController().signal, maxBytes: 4 });
  const grandchildPID = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('grandchild PID timeout')), 2000);
    child.once('message', message => { clearTimeout(timer); resolve(message.grandchild); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  await assert.rejects(pending, error => error.code === 'RESPONSE_LIMIT');
  const pid = await grandchildPID;
  let gone = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') { gone = true; break; } }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!gone) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  assert.equal(gone, true, 'grandchild should be killed with the detached process group');
});

test('model and tool rows are capped with explicit truncation and output stays valid and bounded', async t => {
  const root = fixture(t); const stats = fixtureStats();
  stats.models = Array.from({ length: 8 }, (_, index) => ({
    model: { providerID: 'vendor', id: `model-${index}-${'x'.repeat(40)}` }, steps: 1,
    tokens: tokens(1, 1, 0, 0, 0), cost: 0.1,
  }));
  stats.tools.usage = Array.from({ length: 8 }, (_, index) => ({ name: `tool-${index}-${'y'.repeat(40)}`, ...totals(1, 1, 0, 0) }));
  const transport = runnerFor(root, stats);
  const report = await usageAudit({ root, tools: 'detail', now, maxRows: 2, maxOutputBytes: 4000, runner: transport.runner });
  assert.equal(report.models.length, 2); assert.equal(report.tools.usage.length, 2);
  assert.equal(report.truncation.complete, false);
  assert.equal(report.truncation.modelsOmitted, 6); assert.equal(report.truncation.toolsOmitted, 6);
  const json = renderUsage(report, 'json');
  assert.ok(Buffer.byteLength(json) <= 4000);
  assert.doesNotThrow(() => JSON.parse(json));
  assert.ok(Buffer.byteLength(renderUsage(report, 'markdown')) <= 4000);
});

test('output trimming counts every removed row and makes progress at one-row and no-progress caps', async t => {
  const root = fixture(t); const stats = fixtureStats();
  stats.models = Array.from({ length: 8 }, (_, index) => ({
    model: { providerID: 'vendor', id: `model-${index}-${'x'.repeat(80)}` },
    tokens: tokens(1, 1, 0, 0, 0), cost: 0.1,
  }));
  stats.tools.usage = Array.from({ length: 8 }, (_, index) => ({ name: `tool-${index}-${'y'.repeat(80)}`, ...totals(1, 1, 0, 0) }));
  const report = await usageAudit({ root, tools: 'detail', now, maxRows: 20, maxOutputBytes: 100000, runner: runnerFor(root, stats).runner });
  const full = Buffer.byteLength(JSON.stringify(report));
  let trimmed;
  for (const ratio of [0.7, 0.5, 0.35, 0.25]) {
    const cap = Math.floor(full * ratio);
    try {
      const candidate = JSON.parse(renderUsage(report, 'json', cap));
      if (candidate.models.length < report.models.length || (candidate.tools.usage?.length ?? 0) < report.tools.usage.length) { trimmed = candidate; break; }
    } catch (error) { assert.match(error.message, /metadata exceeds/); }
  }
  assert.ok(trimmed, 'expected at least one output trim');
  const removedModels = report.models.length - trimmed.models.length;
  const removedTools = report.tools.usage.length - trimmed.tools.usage.length;
  assert.equal(trimmed.truncation.modelsOmitted, report.truncation.modelsOmitted + removedModels);
  assert.equal(trimmed.truncation.toolsOmitted, report.truncation.toolsOmitted + removedTools);
  assert.equal(trimmed.truncation.outputTrimmed, true);

  const one = fixtureStats(); one.models = [{ model: { providerID: 'vendor', id: 'x'.repeat(200) }, tokens: tokens(1, 1, 0, 0, 0), cost: 0 }];
  one.tools.usage = [];
  const single = await usageAudit({ root, tools: 'detail', now, maxOutputBytes: 100000, runner: runnerFor(root, one).runner });
  const empty = structuredClone(single); empty.models = []; empty.truncation.modelsOmitted += 1;
  empty.truncation.outputTrimmed = true; empty.truncation.complete = false;
  const cap = Buffer.byteLength(`${JSON.stringify(empty, null, 2)}\n`) + 32;
  const oneTrimmed = JSON.parse(renderUsage(single, 'json', cap));
  assert.equal(oneTrimmed.models.length, 0);
  assert.equal(oneTrimmed.truncation.modelsOmitted, single.truncation.modelsOmitted + 1);
  assert.throws(() => renderUsage(single, 'json', 1), /metadata exceeds/i);
});

test('duplicate MAX_VALUE aggregates fail instead of rendering unsafe numbers or null', async t => {
  const root = fixture(t); const max = Number.MAX_SAFE_INTEGER;
  for (const kind of ['tokens', 'cost', 'tools']) {
    const stats = fixtureStats();
    if (kind === 'tokens') {
      stats.models = [
        { model: { providerID: 'vendor', id: 'same' }, tokens: tokens(max, 0, 0, 0, 0), cost: 0 },
        { model: { providerID: 'vendor', id: 'same' }, tokens: tokens(max, 0, 0, 0, 0), cost: 0 },
      ];
    } else if (kind === 'cost') {
      stats.models = [
        { model: { providerID: 'vendor', id: 'same' }, tokens: tokens(0, 0, 0, 0, 0), cost: max },
        { model: { providerID: 'vendor', id: 'same' }, tokens: tokens(0, 0, 0, 0, 0), cost: max },
      ];
    } else {
      stats.tools.usage = [
        { name: 'same', ...totals(max, 0, 0, 0) },
        { name: 'same', ...totals(max, 0, 0, 0) },
      ];
    }
    await assert.rejects(usageAudit({ root, tools: 'detail', now, runner: runnerFor(root, stats).runner }), /unsafe.*aggregate|invalid or unsafe/i, kind);
  }
});

test('CLI prints one bounded report, returns nonzero on failure, and never writes project files', async t => {
  const root = fixture(t); const transport = runnerFor(root);
  const lines = []; const errors = [];
  const code = await main(['--root', root, '--format', 'json', '--tools', 'detail', '--timezone', 'UTC'], {
    now, runner: transport.runner, log: line => lines.push(line), error: line => errors.push(line),
  });
  assert.equal(code, 0); assert.deepEqual(errors, []); assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).project.id, 'project-id');
  assert.deepEqual(readdirSync(root), []);
  const failed = await main(['--root', root], { now, runner: async () => { throw new Error('injected'); }, log: () => {}, error: line => errors.push(line) });
  assert.equal(failed, 1); assert.match(errors.at(-1), /usage audit failed/i);
  assert.deepEqual(readdirSync(root), []);
});

test('default stdout writer preserves the exact rendered output cap without adding a newline', async t => {
  const root = fixture(t); const runner = runnerFor(root).runner;
  const probe = await usageAudit({ root, tools: 'detail', now, maxOutputBytes: 4000, runner });
  const cap = Buffer.byteLength(renderUsage(probe, 'json', 4000));
  assert.ok(cap >= 1000 && cap <= 9999, 'fixture should keep a four-digit cap');
  const writes = []; const original = process.stdout.write;
  process.stdout.write = chunk => { writes.push(Buffer.from(chunk)); return true; };
  try {
    const code = await main(['--root', root, '--format', 'json', '--tools', 'detail', '--timezone', 'UTC'], {
      now, runner, maxOutputBytes: cap, error: () => {},
    });
    assert.equal(code, 0);
  } finally { process.stdout.write = original; }
  assert.equal(writes.length, 1);
  assert.equal(writes.reduce((total, chunk) => total + chunk.length, 0), cap);
});

test('standalone copied script runs on Node 20+ without package dependencies', t => {
  const root = fixture(t); const copy = path.join(root, 'usage-audit.mjs'); cpSync(script, copy);
  const result = spawnSync(process.execPath, [copy, '--help'], { encoding: 'utf8', cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--root DIR/);
  assert.match(result.stdout, /no deps|dependency-free|standalone/i);
  assert.deepEqual(readdirSync(root), ['usage-audit.mjs']);
  const source = readFileSync(copy, 'utf8');
  assert.doesNotMatch(source, /shell:\s*true|execFileSync|\bexec\(/);
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.match(match[1], /^node:/);
});
