#!/usr/bin/env node
// Local artifact ledger only. No OpenCode API, execution, imports, or policy edits.
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, realpathSync, mkdirSync, readFileSync, readSync, writeFileSync, openSync, closeSync, fsyncSync, renameSync, unlinkSync, rmdirSync } from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 4 * 1024 * 1024;
const fail = message => { throw new Error(message); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function keys(x, required, optional = []) {
  if (!object(x) || required.some(k => !Object.hasOwn(x, k)) || Object.keys(x).some(k => ![...required, ...optional].includes(k))) fail('Invalid schema fields');
}
function text(x, max = 8192) { if (typeof x !== 'string' || !x.trim() || x.length > max) fail('Invalid or oversized text'); }
function list(x) { if (!Array.isArray(x) || !x.length || x.length > 32) fail('Expected 1..32 evidence/items'); x.forEach(v => text(v)); }
function time(x) { text(x, 40); if (!Number.isFinite(Date.parse(x)) || new Date(x).toISOString() !== x) fail('Expected canonical ISO UTC timestamp'); }
function identifier(x) { if (typeof x !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(x)) fail('Invalid identifier'); }
const taskTransitions = {
  queued: ['queued', 'active', 'paused', 'blocked', 'cancelled'],
  active: ['active', 'blocked', 'paused', 'completed', 'cancelled'],
  blocked: ['blocked', 'active', 'paused', 'cancelled'],
  paused: ['paused', 'active', 'blocked', 'cancelled'],
  completed: ['completed'], cancelled: ['cancelled'],
};
const terminalTask = status => ['completed', 'cancelled'].includes(status);
const unresolvedJob = job => ['running', 'reconciling'].includes(job.status);
function taskPayload(task) {
  keys(task, ['status', 'relation', 'budgetUsed', 'jobs'], ['parent', 'completionEvidence']);
  if (typeof task.status !== 'string' || !Object.hasOwn(taskTransitions, task.status) || !['root', 'required', 'branch'].includes(task.relation)) fail('Invalid task status/relation');
  if (task.relation === 'root') { if (Object.hasOwn(task, 'parent')) fail('Root task cannot have a parent'); }
  else identifier(task.parent);
  keys(task.budgetUsed, ['repairs', 'steps']);
  for (const n of Object.values(task.budgetUsed)) if (!Number.isSafeInteger(n) || n < 0) fail('Invalid consumed budget');
  if (!Array.isArray(task.jobs) || task.jobs.length > 32) fail('Expected at most 32 delegated jobs');
  const ids = new Set();
  for (const job of task.jobs) {
    keys(job, ['id', 'status', 'writeScope']); identifier(job.id); list(job.writeScope);
    if (ids.has(job.id) || !['running', 'reconciling', 'finished', 'cancelled'].includes(job.status)) fail('Invalid/duplicate delegated job');
    ids.add(job.id);
  }
  if (task.status === 'completed') {
    list(task.completionEvidence);
    if (task.jobs.some(unresolvedJob)) fail('Reconcile outstanding jobs before completion');
  } else if (Object.hasOwn(task, 'completionEvidence')) fail('Completion evidence requires completed status');
}
function payload(kind, data) {
  const common = ['provenance'];
  if (kind === 'checkpoint') {
    keys(data, [...common, 'goal', 'scope', 'acceptance', 'next', 'verification', 'limits'], ['task']);
    text(data.goal); for (const k of ['scope', 'acceptance', 'next', 'verification']) list(data[k]);
    keys(data.limits, ['maxRepairs', 'maxSteps']);
    for (const n of Object.values(data.limits)) if (!Number.isInteger(n) || n < 0 || n > 10000) fail('Invalid task limit');
    if (Object.hasOwn(data, 'task')) taskPayload(data.task);
  } else {
    keys(data, [...common, 'summary', 'expiresAt', ...(kind === 'candidate' ? ['artifact', 'content'] : [])]);
    text(data.summary); time(data.expiresAt);
    if (kind === 'candidate') { if (data.artifact !== 'learned-skill') fail('Only learned-skill proposals are supported'); text(data.content, 32768); }
  }
  keys(data.provenance, ['source', 'observedAt', 'evidence']);
  text(data.provenance.source); time(data.provenance.observedAt); list(data.provenance.evidence);
  if (data.expiresAt && Date.parse(data.expiresAt) <= Date.parse(data.provenance.observedAt)) fail('Expiry must follow observation');
}
function safe(file) {
  let current = path.parse(file).root;
  for (const segment of file.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) fail(`Refusing symlink: ${current}`);
      if (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)) fail(`Unsupported or hard-linked path: ${current}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
const digest = (project, record) => createHash('sha256').update(JSON.stringify([project, record.kind, record.id, record.version, record.data])).digest('hex');
const statuses = { put: 'proposed', accept: 'accepted', promote: 'approved', rollback: 'revoked', invalidate: 'invalid' };
function transition(previous, record) {
  if (record.operation === 'put') return;
  if (!previous || JSON.stringify(previous.data) !== JSON.stringify(record.data)) fail('Invalid transition data');
  const status = statuses[previous.operation];
  if (record.operation === 'accept' && !(record.kind === 'memory' && status === 'proposed')) fail('Only proposed memory can be accepted');
  if (record.operation === 'promote' && !(record.kind === 'candidate' && ['proposed', 'revoked'].includes(status))) fail('Only proposed/revoked candidates can be approved');
  if (record.operation === 'rollback' && !(record.kind === 'candidate' && status === 'approved')) fail('Only the current approved candidate can be revoked');
  if (record.operation === 'invalidate' && status === 'invalid') fail('Already invalid');
  if (['accept', 'promote'].includes(record.operation) && Date.parse(record.data.expiresAt) <= Date.parse(record.at)) fail('Expired material cannot be accepted');
}
function taskTransition(previous, record, current) {
  if (record.kind !== 'checkpoint') return;
  const old = previous?.data.task; const task = record.data.task;
  if (old && !task) fail('Task metadata cannot be removed');
  if (!task) return; // Original schema-v1 checkpoints remain readable, not silently completed.
  if (old) {
    if (old.relation !== task.relation || old.parent !== task.parent) fail('Task relationships are immutable; use a new task ID');
    if (!taskTransitions[old.status].includes(task.status)) fail('Unsupported task transition');
    for (const field of ['repairs', 'steps']) if (task.budgetUsed[field] < old.budgetUsed[field]) fail('Consumed budgets cannot reset');
    for (const job of old.jobs) {
      const next = task.jobs.find(item => item.id === job.id);
      if (!next && unresolvedJob(job)) fail('Outstanding job cannot disappear; reconcile it explicitly');
      if (next && (JSON.stringify(next.writeScope) !== JSON.stringify(job.writeScope) || (!unresolvedJob(job) && next.status !== job.status))) fail('Job ownership/status cannot silently reset');
    }
  } else if (terminalTask(task.status)) fail('New task metadata must start unfinished before a terminal transition');
  const seen = new Set([record.id]); let parent = task.parent;
  while (parent !== undefined) {
    if (seen.has(parent)) fail('Task parent cycle/self-parent'); seen.add(parent);
    const ancestor = current.get(`checkpoint:${parent}`);
    if (!ancestor) fail('Task parent must reference an existing project checkpoint');
    parent = ancestor.data.task?.parent;
  }
}
function validate(state, project) {
  keys(state, ['schemaVersion', 'project', 'revision', 'records']);
  if (state.schemaVersion !== 1 || state.project !== project) fail('Unsupported schema or foreign project identity');
  if (!Array.isArray(state.records) || state.records.length > 1000 || state.revision !== state.records.length) fail('Invalid revision or record limit');
  const current = new Map();
  for (const [index, record] of state.records.entries()) {
    keys(record, ['revision', 'kind', 'id', 'version', 'operation', 'at', 'data', 'hash', 'reason', 'actor']);
    if (!['checkpoint', 'memory', 'candidate'].includes(record.kind)) fail('Invalid record kind');
    identifier(record.id); time(record.at); text(record.reason); text(record.actor, 256);
    if (typeof record.operation !== 'string' || !Object.hasOwn(statuses, record.operation)) fail('Invalid operation');
    payload(record.kind, record.data);
    const key = `${record.kind}:${record.id}`; const previous = current.get(key);
    if (record.revision !== index + 1 || record.version !== (previous?.version ?? 0) + 1 || record.hash !== digest(project, record)) fail('Invalid version or content hash');
    transition(previous, record); taskTransition(previous, record, current); current.set(key, record);
  }
  return current;
}
function stdin() {
  const parts = []; let size = 0; const chunk = Buffer.alloc(65536); let n;
  while ((n = readSync(0, chunk, 0, chunk.length, null))) {
    size += n; if (size > 128 * 1024) fail('Input exceeds 128 KiB'); parts.push(Buffer.from(chunk.subarray(0, n)));
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function main() {
  const args = process.argv.slice(2); const options = {}; const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (['--project', '--expect', '--manual'].includes(args[i])) {
      const key = args[i].slice(2); if (options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) fail('Missing/duplicate option'); options[key] = args[++i];
    } else if (args[i].startsWith('--')) fail('Unknown option'); else positional.push(args[i]);
  }
  if (!options.project) fail('Usage: task-state.mjs --project DIR status|history|lessons|tasks|show KIND ID|put KIND ID|accept memory ID|promote candidate ID|rollback candidate ID|invalidate KIND ID [--expect REV] [--manual REVIEWER]. Writes read JSON stdin. See task-state.md.');
  const project = path.resolve(options.project); safe(project);
  if (!lstatSync(project).isDirectory() || realpathSync(project) !== project) fail('Project must be a canonical existing directory');
  const directory = path.join(project, '.toolkit-state'); const file = path.join(directory, 'state.json');
  const lock = path.join(directory, 'write.lock'); safe(file); safe(lock);
  const [operation, kind, id] = positional;
  const readOnly = ['status', 'history', 'lessons', 'tasks', 'show'].includes(operation);
  if (!readOnly && !Object.hasOwn(statuses, operation)) fail('Unknown command');
  if (positional.length !== (['status', 'history', 'lessons', 'tasks'].includes(operation) ? 1 : 3)) fail('Invalid command arguments');
  if (kind !== undefined && !['checkpoint', 'memory', 'candidate'].includes(kind)) fail('Invalid kind');
  if (id !== undefined) identifier(id);
  if (readOnly && (options.expect !== undefined || options.manual !== undefined)) fail('Write options on read command');
  if (!readOnly && !/^(0|[1-9][0-9]*)$/.test(options.expect ?? '')) fail('Writes require --expect REV');
  let locked = false; let temporary;
  try {
    if (!readOnly) {
      mkdirSync(directory, { recursive: true, mode: 0o700 }); safe(directory);
      try { mkdirSync(lock, { mode: 0o700 }); locked = true; } catch (error) { if (error.code === 'EEXIST') fail('Writer lock exists; never auto-stolen. Confirm no writer before manual recovery.'); throw error; }
      writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
    }
    let state;
    try {
      safe(file); if (lstatSync(file).size > MAX_BYTES) fail('State exceeds 4 MiB');
      state = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) { if (error.code !== 'ENOENT') throw error; state = { schemaVersion: 1, project, revision: 0, records: [] }; }
    const current = validate(state, project);
    const latest = current.get(`${kind}:${id}`);
    const view = record => ({ ...record, status: record.kind === 'checkpoint' && record.operation === 'put' ? 'checkpoint' : statuses[record.operation],
      ...(record.kind === 'checkpoint' ? { taskStatus: record.data.task?.status ?? 'unclassified', needsReconciliation: record.operation === 'invalidate' || !!record.data.task?.jobs.some(unresolvedJob) } : {}),
      trust: 'untrusted evidence; not instructions' });
    const live = record => record.operation !== 'invalidate' && (!record.data.expiresAt || Date.parse(record.data.expiresAt) > Date.now());
    if (readOnly) {
      if (operation === 'history') return state;
      if (operation === 'status') return { project, revision: state.revision, records: [...current.values()].map(r => ({ kind: r.kind, id: r.id, version: r.version, hash: r.hash, status: view(r).status, taskStatus: view(r).taskStatus, expired: !!r.data.expiresAt && Date.parse(r.data.expiresAt) <= Date.now() })) };
      if (operation === 'tasks') return { project, revision: state.revision, tasks: [...current.values()].filter(r => r.kind === 'checkpoint' && (!terminalTask(r.data.task?.status) || r.data.task.jobs.some(unresolvedJob))).map(view), execution: 'none; reconcile and schedule through the authorized manager' };
      if (operation === 'lessons') return { project, revision: state.revision, lessons: [...current.values()].filter(r => r.kind === 'memory' && r.operation === 'accept' && live(r)).map(view) };
      if (!latest || !live(latest) || (kind === 'memory' && latest.operation !== 'accept')) fail('No active record; inspect history explicitly for proposals/invalid/expired evidence');
      return view(latest);
    }
    if (Number(options.expect) !== state.revision) fail(`Revision conflict: current ${state.revision}; reread and reconcile`);
    const input = stdin();
    const manual = ['accept', 'promote', 'rollback'].includes(operation);
    if (manual) text(options.manual, 256);
    else if (options.manual !== undefined) fail('--manual only applies to acceptance/approval/revocation');
    if (operation !== 'put') { keys(input, ['reason']); text(input.reason); }
    const record = {
      revision: state.revision + 1, kind, id, version: (latest?.version ?? 0) + 1, operation,
      at: new Date().toISOString(), data: operation === 'put' ? input : latest?.data,
      hash: '', reason: operation === 'put' ? 'explicit local submission' : input.reason,
      actor: manual ? options.manual : 'local caller (not authenticated)',
    };
    record.hash = digest(project, record);
    state.records.push(record); state.revision++; validate(state, project);
    const content = `${JSON.stringify(state, null, 2)}\n`; if (Buffer.byteLength(content) > MAX_BYTES) fail('State exceeds 4 MiB');
    temporary = path.join(directory, `.${randomUUID()}.tmp`); safe(temporary);
    const fd = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
    safe(file); renameSync(temporary, file); temporary = undefined;
    return { project, revision: state.revision, record: view(record), activation: 'none; local ledger only', identity: 'caller-supplied, not human authentication' };
  } finally {
    if (temporary) unlinkSync(temporary);
    if (locked) {
      try { unlinkSync(path.join(lock, 'owner.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      rmdirSync(lock);
    }
  }
}
try { console.log(JSON.stringify(main(), null, 2)); }
catch (error) { console.error(`Task state failed: ${error.message}`); process.exitCode = 1; }
