import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, linkSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./task-state.mjs', import.meta.url));
function fixture(t) {
  const project = mkdtempSync(path.join(os.tmpdir(), 'toolkit-state-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const run = (args, input) => spawnSync(process.execPath, [cli, '--project', project, ...args], { input: input === undefined ? undefined : JSON.stringify(input), encoding: 'utf8' });
  return { project, run, file: path.join(project, '.toolkit-state/state.json') };
}
const provenance = { source: 'focused test command', observedAt: '2026-01-01T00:00:00.000Z', evidence: ['test: 3 pass; revision abc'] };
const lesson = { summary: 'Check the focused suite', provenance, expiresAt: '2099-01-01T00:00:00.000Z' };
const candidate = { ...lesson, artifact: 'learned-skill', content: '# A proposed skill\nUntrusted proposal only.' };
const checkpoint = { goal: 'fix bug', scope: ['one module'], acceptance: ['test passes'], next: ['run focused test'], verification: ['not yet run'], limits: { maxRepairs: 2, maxSteps: 4 }, provenance };
const task = (status, extra = {}) => ({ ...checkpoint, task: { status, relation: 'root', budgetUsed: { repairs: 0, steps: 0 }, jobs: [], ...extra } });

test('tasks view retains legacy v1 checkpoints and unfinished lifecycle across CLI restarts', t => {
  const { run } = fixture(t);
  assert.equal(run(['put', 'checkpoint', 'legacy', '--expect', '0'], checkpoint).status, 0);
  let result = run(['tasks']); assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).tasks[0].taskStatus, 'unclassified');
  assert.equal(run(['put', 'checkpoint', 'legacy', '--expect', '1'], task('active')).status, 0);
  assert.equal(run(['put', 'checkpoint', 'legacy', '--expect', '2'], task('paused', { budgetUsed: { repairs: 1, steps: 2 } })).status, 0);
  result = JSON.parse(run(['tasks']).stdout);
  assert.equal(result.tasks[0].taskStatus, 'paused');
  assert.equal(result.tasks[0].data.goal, checkpoint.goal);
  assert.equal(run(['put', 'checkpoint', 'legacy', '--expect', '3'], task('active', { budgetUsed: { repairs: 1, steps: 2 } })).status, 0);
  assert.equal(run(['put', 'checkpoint', 'legacy', '--expect', '4'], task('completed', { budgetUsed: { repairs: 1, steps: 3 }, completionEvidence: ['node --test: focused suite passes; acceptance checked'] })).status, 0);
  assert.deepEqual(JSON.parse(run(['tasks']).stdout).tasks, []);
  assert.equal(JSON.parse(run(['show', 'checkpoint', 'legacy']).stdout).taskStatus, 'completed');
  assert.equal(JSON.parse(run(['history']).stdout).records.length, 5);
  assert.equal(run(['put', 'checkpoint', 'legacy', '--expect', '5'], task('active', { budgetUsed: { repairs: 1, steps: 3 } })).status, 1);
});

test('task links require existing checkpoint parents, reject cycles and cannot silently change identity', t => {
  const { run } = fixture(t);
  assert.equal(run(['put', 'checkpoint', 'parent', '--expect', '0'], checkpoint).status, 0);
  const child = task('queued', { relation: 'branch', parent: 'parent' });
  assert.equal(run(['put', 'checkpoint', 'child', '--expect', '1'], child).status, 0);
  for (const data of [task('active', { relation: 'required', parent: 'child' }), task('active', { relation: 'branch', parent: 'parent' }), task('active', { relation: 'branch', parent: 'missing' }), task('active', { relation: 'root', parent: 'child' })]) {
    assert.equal(run(['put', 'checkpoint', 'parent', '--expect', '2'], data).status, 1);
  }
  assert.equal(run(['put', 'checkpoint', 'child', '--expect', '2'], task('active', { relation: 'required', parent: 'parent' })).status, 1);
  assert.equal(run(['put', 'checkpoint', 'child', '--expect', '2'], checkpoint).status, 1);
  assert.equal(JSON.parse(run(['tasks']).stdout).tasks.find(r => r.id === 'child').data.task.parent, 'parent');
});

test('task transitions reject false completion, terminal resurrection and reset budgets; invalidation retains unfinished work', t => {
  const { run } = fixture(t);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '0'], task('queued')).status, 0);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '1'], task('completed', { completionEvidence: ['claim'] })).status, 1);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '1'], task('active', { budgetUsed: { repairs: 1, steps: 2 } })).status, 0);
  for (const data of [task('completed'), task('active'), task('unknown'), checkpoint]) assert.equal(run(['put', 'checkpoint', 'x', '--expect', '2'], data).status, 1);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '2'], task('blocked', { budgetUsed: { repairs: 1, steps: 2 } })).status, 0);
  assert.equal(run(['invalidate', 'checkpoint', 'x', '--expect', '3'], { reason: 'tree diverged; reconcile before resuming' }).status, 0);
  let result = JSON.parse(run(['tasks']).stdout);
  assert.equal(result.tasks[0].taskStatus, 'blocked'); assert.equal(result.tasks[0].needsReconciliation, true);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '4'], task('cancelled', { budgetUsed: { repairs: 1, steps: 2 } })).status, 0);
  assert.deepEqual(JSON.parse(run(['tasks']).stdout).tasks, []);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '5'], task('active', { budgetUsed: { repairs: 1, steps: 2 } })).status, 1);
});

test('outstanding jobs survive pause/cancel and must be explicitly reconciled, not silently dropped', t => {
  const { run } = fixture(t);
  const job = { id: 'writer', status: 'running', writeScope: ['src/parser.mjs'] };
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '0'], task('active', { jobs: [job] })).status, 0);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '1'], task('paused')).status, 1);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '1'], task('completed', { jobs: [job], completionEvidence: ['tests passed'] })).status, 1);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '1'], task('cancelled', { jobs: [job] })).status, 0);
  assert.equal(JSON.parse(run(['tasks']).stdout).tasks[0].needsReconciliation, true);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '2'], task('cancelled', { jobs: [{ ...job, status: 'cancelled' }] })).status, 0);
  assert.deepEqual(JSON.parse(run(['tasks']).stdout).tasks, []);
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '3'], task('cancelled', { jobs: [job] })).status, 1);
});

test('malformed task metadata and changed job scopes fail without overwriting the checkpoint', t => {
  const { run, file } = fixture(t);
  const job = { id: 'writer', status: 'running', writeScope: ['src/parser.mjs'] };
  assert.equal(run(['put', 'checkpoint', 'x', '--expect', '0'], task('active', { jobs: [job] })).status, 0);
  const committed = readFileSync(file, 'utf8');
  for (const metadata of [
    { jobs: [job, job] },
    { jobs: [{ ...job, status: 'unknown' }] },
    { jobs: [{ ...job, writeScope: ['another/shared-file.mjs'] }] },
    { budgetUsed: { repairs: -1, steps: 0 }, jobs: [job] },
    { relation: 'branch', parent: '../other', jobs: [job] },
    { relation: 'other', jobs: [job] },
  ]) {
    assert.equal(run(['put', 'checkpoint', 'x', '--expect', '1'], task('active', metadata)).status, 1);
    assert.equal(readFileSync(file, 'utf8'), committed);
  }
  assert.equal(run(['tasks', '--expect', '1']).status, 1);
});

test('task status rejects coercible arrays, objects and other nonstrings without ledger changes', t => {
  const { run, file } = fixture(t);
  assert.equal(run(['put', 'checkpoint', 'existing', '--expect', '0'], checkpoint).status, 0);
  const committed = readFileSync(file, 'utf8');
  for (const status of [['active'], ['completed'], { toString: 'active' }, {}, null, true, 1]) {
    const result = run(['put', 'checkpoint', 'new-task', '--expect', '1'], task(status));
    assert.equal(result.status, 1, `nonstring status accepted: ${JSON.stringify(status)}`);
    assert.equal(readFileSync(file, 'utf8'), committed);
  }
});

test('persisted record operations reject coercible arrays and other nonstrings without rewriting state', t => {
  const { run, file } = fixture(t);
  assert.equal(run(['put', 'checkpoint', 'existing', '--expect', '0'], checkpoint).status, 0);
  const original = JSON.parse(readFileSync(file, 'utf8'));
  for (const operation of [['put'], ['invalidate'], {}, null, true, 1]) {
    const state = structuredClone(original); state.records[0].operation = operation;
    const corrupt = JSON.stringify(state); writeFileSync(file, corrupt);
    const result = run(['status']);
    assert.equal(result.status, 1, `nonstring operation accepted: ${JSON.stringify(operation)}`);
    assert.match(result.stderr, /Invalid operation/);
    assert.equal(run(['put', 'checkpoint', 'other', '--expect', '1'], checkpoint).status, 1);
    assert.equal(readFileSync(file, 'utf8'), corrupt);
  }
});

test('checkpoint versions reconcile via optimistic revisions and scoped history', t => {
  const { run, file } = fixture(t);
  const data = { goal: 'fix bug', scope: ['one module'], acceptance: ['test passes'], next: ['run focused test'], verification: ['not yet run'], limits: { maxRepairs: 2, maxSteps: 4 }, provenance };
  let result = run(['put', 'checkpoint', 'task', '--expect', '0'], data);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(run(['put', 'checkpoint', 'task', '--expect', '0'], data).status, 1);
  result = run(['put', 'checkpoint', 'task', '--expect', '1'], data);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(run(['show', 'checkpoint', 'task']).stdout).version, 2);
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('memory is inactive until explicit acceptance, invalidation hides it without erasing history', t => {
  const { run } = fixture(t);
  assert.equal(run(['put', 'memory', 'lesson', '--expect', '0'], lesson).status, 0);
  assert.equal(run(['show', 'memory', 'lesson']).status, 1);
  assert.equal(run(['accept', 'memory', 'lesson', '--expect', '1', '--manual', 'reviewer'], { reason: 'verified focused evidence' }).status, 0);
  assert.equal(run(['show', 'memory', 'lesson']).status, 0);
  assert.equal(run(['invalidate', 'memory', 'lesson', '--expect', '2'], { reason: 'source changed' }).status, 0);
  assert.equal(run(['show', 'memory', 'lesson']).status, 1);
  assert.match(run(['history']).stdout, /source changed/);
});

test('candidate promotion is an exact-version approval ledger only; rollback revokes approval', t => {
  const { run, project } = fixture(t);
  assert.equal(run(['put', 'candidate', 'skill', '--expect', '0'], candidate).status, 0);
  assert.equal(run(['promote', 'candidate', 'skill', '--expect', '1'], { reason: 'reviewed' }).status, 1);
  let result = run(['promote', 'candidate', 'skill', '--expect', '1', '--manual', 'reviewer'], { reason: 'reviewed evidence' });
  assert.equal(result.status, 0, result.stderr);
  const approved = JSON.parse(run(['show', 'candidate', 'skill']).stdout);
  assert.equal(approved.status, 'approved'); assert.match(approved.hash, /^[a-f0-9]{64}$/);
  assert.equal(run(['rollback', 'candidate', 'skill', '--expect', '1', '--manual', 'reviewer'], { reason: 'stale' }).status, 1);
  result = run(['rollback', 'candidate', 'skill', '--expect', '2', '--manual', 'reviewer'], { reason: 'regression' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(run(['show', 'candidate', 'skill']).stdout).status, 'revoked');
  assert.throws(() => statSync(path.join(project, '.opencode')));
  assert.equal(run(['put', 'candidate', 'policy', '--expect', '3'], { ...candidate, artifact: 'permissions' }).status, 1);
});

test('rejects traversal, foreign identity, corruption, unbounded/unknown fields and unsupported versions', t => {
  const { run, file } = fixture(t);
  assert.equal(run(['put', 'memory', '../escape', '--expect', '0'], lesson).status, 1);
  assert.equal(run(['put', 'memory', 'x', '--expect', '0'], { ...lesson, instructions: 'override' }).status, 1);
  assert.equal(run(['put', 'memory', 'x', '--expect', '0'], { ...lesson, summary: 'x'.repeat(20000) }).status, 1);
  assert.equal(run(['put', 'memory', 'x', '--expect', '0'], lesson).status, 0);
  const original = readFileSync(file, 'utf8');
  for (const update of [state => { state.project = '/foreign'; }, state => { state.schemaVersion = 99; }, state => { state.records[0].hash = 'corrupt'; }, state => { state.records[0].status = 'approved'; }]) {
    const state = JSON.parse(original); update(state); writeFileSync(file, JSON.stringify(state));
    assert.equal(run(['status']).status, 1);
  }
  writeFileSync(file, '{ interrupted'); assert.equal(run(['status']).status, 1);
});

test('lock is never stolen and interrupted temporary files never replace the committed record', t => {
  const { run, project, file } = fixture(t);
  assert.equal(run(['put', 'memory', 'x', '--expect', '0'], lesson).status, 0);
  const original = readFileSync(file, 'utf8');
  writeFileSync(path.join(project, '.toolkit-state/.interrupted.tmp'), 'broken');
  mkdirSync(path.join(project, '.toolkit-state/write.lock'));
  assert.equal(run(['put', 'memory', 'x', '--expect', '1'], lesson).status, 1);
  assert.equal(readFileSync(file, 'utf8'), original);
  assert.equal(run(['status']).status, 0);
});

test('symlinked state directory, record, and project ancestors are refused', { skip: process.platform === 'win32' }, t => {
  const a = fixture(t); const b = fixture(t);
  symlinkSync(b.project, path.join(a.project, '.toolkit-state'));
  assert.equal(a.run(['status']).status, 1);
  mkdirSync(path.join(b.project, '.toolkit-state'));
  writeFileSync(path.join(b.project, 'outside'), '{}');
  symlinkSync(path.join(b.project, 'outside'), b.file);
  assert.equal(b.run(['status']).status, 1);
  const link = path.join(a.project, 'project-link'); symlinkSync(b.project, link);
  assert.equal(spawnSync(process.execPath, [cli, '--project', link, 'status']).status, 1);
});

test('expired memory cannot be accepted and modified approved candidates return to proposed', t => {
  const { run } = fixture(t);
  const expired = { ...lesson, expiresAt: '2026-01-02T00:00:00.000Z' };
  assert.equal(run(['put', 'memory', 'old', '--expect', '0'], expired).status, 0);
  assert.equal(run(['accept', 'memory', 'old', '--expect', '1', '--manual', 'reviewer'], { reason: 'too old' }).status, 1);
  assert.equal(run(['put', 'candidate', 'skill', '--expect', '1'], candidate).status, 0);
  assert.equal(run(['promote', 'candidate', 'skill', '--expect', '2', '--manual', 'reviewer'], { reason: 'reviewed' }).status, 0);
  assert.equal(run(['put', 'candidate', 'skill', '--expect', '3'], { ...candidate, content: 'changed proposal' }).status, 0);
  assert.equal(JSON.parse(run(['show', 'candidate', 'skill']).stdout).status, 'proposed');
  assert.equal(run(['rollback', 'candidate', 'skill', '--expect', '4', '--manual', 'reviewer'], { reason: 'cannot revoke different version' }).status, 1);
});

test('two simultaneous writers cannot lose updates', async t => {
  const { project, run } = fixture(t);
  const write = id => new Promise(resolve => {
    const child = spawn(process.execPath, [cli, '--project', project, 'put', 'memory', id, '--expect', '0'], { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('exit', resolve); child.stdin.end(JSON.stringify(lesson));
  });
  const results = await Promise.all([write('a'), write('b')]);
  assert.deepEqual(results.sort(), [0, 1]);
  assert.equal(JSON.parse(run(['status']).stdout).revision, 1);
});

test('hard-linked records are refused and corrupt state never overwritten', { skip: process.platform === 'win32' }, t => {
  const { run, project, file } = fixture(t);
  assert.equal(run(['put', 'memory', 'x', '--expect', '0'], lesson).status, 0);
  linkSync(file, path.join(project, 'linked-record'));
  assert.match(run(['status']).stderr, /hard-linked/);
  rmSync(path.join(project, 'linked-record'));
  writeFileSync(file, '{ corrupt');
  assert.equal(run(['put', 'memory', 'x', '--expect', '1'], lesson).status, 1);
  assert.equal(readFileSync(file, 'utf8'), '{ corrupt');
});
