#!/usr/bin/env node
// Standalone, read-only OpenCode usage audit. Node.js 20+, no dependencies,
// no direct filesystem writes; the invoked CLI/service may write state or logs.
// No network access occurs except through the local `opencode api` command.
import { spawn } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULTS = Object.freeze({ days: 7, format: 'markdown', tools: 'summary', timezone: 'UTC' });
const LIMITS = Object.freeze({ maxResponseBytes: 8 * 1024 * 1024, timeoutMs: 30000, maxRows: 1000, maxOutputBytes: 256 * 1024 });
const HELP = `Standalone, read-only OpenCode usage audit (Node.js 20+).

Usage:
  node .opencode/tools/usage-audit.mjs --root DIR [options]

Options:
  --root DIR              canonical project root (default: current directory)
  --days N                inclusive-day lookback ending now (default: 7, max: 3650)
  --format markdown|json  output format (default: markdown)
  --tools none|summary|detail
                          tool aggregation requested from the API (default: summary)
  --timezone ZONE         IANA time zone for API grouping (default: UTC)
  --help, -h              show this help

The tool prefers exact GET /api/location resolution, falling back to a strict
canonical Project.ID match through GET /api/project, then calls
GET /api/experimental/session/stats. It emits only token/cache/reasoning counts,
cost, per-model usage, and tool totals/detail. Prompts, message content, activity,
and secrets are never rendered. Responses, rows, time, and output are bounded;
truncation is reported. Missing CLI/API/project data and malformed responses fail
instead of producing fake zeroes. The script makes no direct filesystem writes; the invoked CLI/service may write logs/state or use a remote server. No shell is used.`;

class InputError extends Error {}
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => Object.hasOwn(value, key);

function positiveInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new InputError(`${label} must be an integer from 1 to ${maximum}`);
  return value;
}

function timezone(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.includes('\0')) throw new InputError('--timezone must be a non-empty IANA time zone');
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); }
  catch { throw new InputError(`--timezone is not a valid IANA time zone: ${value}`); }
  return value;
}

export function parseArgs(argv, now = Date.now()) {
  if (!Array.isArray(argv)) throw new InputError('Arguments must be an array');
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const result = { root: process.cwd(), ...DEFAULTS, now };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new InputError(`unexpected argument: ${argument}`);
    const equals = argument.indexOf('=');
    const name = equals === -1 ? argument.slice(2) : argument.slice(2, equals);
    let value = equals === -1 ? argv[++index] : argument.slice(equals + 1);
    if (!['root', 'days', 'format', 'tools', 'timezone'].includes(name)) throw new InputError(`unknown option: --${name}`);
    if (seen.has(name)) throw new InputError(`duplicate option: --${name}`);
    seen.add(name);
    if (value === undefined || (equals === -1 && value.startsWith('--')) || value === '') throw new InputError(`missing value for --${name}`);
    if (name === 'root') {
      if (value.includes('\0')) throw new InputError('--root contains a NUL byte');
      result.root = value;
    } else if (name === 'days') {
      if (!/^[1-9][0-9]*$/.test(value)) throw new InputError('--days must be a positive integer');
      result.days = positiveInteger(Number(value), '--days', 3650);
    } else if (name === 'format') {
      if (!['markdown', 'json'].includes(value)) throw new InputError('--format must be markdown or json');
      result.format = value;
    } else if (name === 'tools') {
      if (!['none', 'summary', 'detail'].includes(value)) throw new InputError('--tools must be none, summary, or detail');
      result.tools = value;
    } else result.timezone = timezone(value);
  }
  if (!Number.isSafeInteger(now) || now < 0) throw new InputError('now must be a non-negative Unix millisecond timestamp');
  result.timezone = timezone(result.timezone);
  result.root = path.resolve(result.root);
  return result;
}

function canonicalRoot(input) {
  if (typeof input !== 'string' || !input.trim() || input.includes('\0')) throw new InputError('--root must be a non-empty directory');
  let root;
  try { root = realpathSync(path.resolve(input)); }
  catch (error) { throw new InputError(`--root is not accessible: ${error.code ?? 'filesystem error'}`); }
  try { if (!statSync(root).isDirectory()) throw new InputError('--root must be a directory'); }
  catch (error) { if (error instanceof InputError) throw error; throw new InputError('--root must be an accessible directory'); }
  if (CONTROL_CHARS.test(root)) throw new InputError('--root canonical path contains control characters');
  return root;
}

export function createRunner({ spawnImpl = spawn, taskkillImpl = spawn, killGraceMs = 250, signalTree,
  platform = process.platform, onCleanupWarning } = {}) {
  if (!Number.isSafeInteger(killGraceMs) || killGraceMs <= 0 || killGraceMs > 5000) throw new InputError('killGraceMs must be an integer from 1 to 5000');
  const reportCleanupWarning = onCleanupWarning ?? (message => { try { process.stderr.write(`${message}\n`); } catch {} });
  const terminateTree = signalTree ?? ((child, signal, state) => {
    if (platform === 'win32') {
      if (!Number.isInteger(child.pid) || child.pid <= 0) { try { child.kill(signal); } catch {} return; }
      const fallback = () => {
        try { child.kill(signal); } catch {}
        reportCleanupWarning('Usage audit cleanup warning: taskkill failed; direct-child termination fallback used.');
      };
      try {
        const killer = taskkillImpl('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
        killer.once('error', fallback);
        killer.once('close', code => {
          if (code === 0) state.taskkillSucceeded = true;
          else fallback();
        });
        killer.unref?.();
      } catch { fallback(); }
      return;
    }
    if (Number.isInteger(child.pid) && child.pid > 0) {
      try { process.kill(-child.pid, signal); return; } catch {}
    }
    try { child.kill(signal); } catch {}
  });
  const treeConfirmedClosed = (child, childClosed = false, state) => {
    if (platform === 'win32') return state.taskkillSucceeded || (!Number.isInteger(child.pid) || child.pid <= 0 ? childClosed : false);
    if (!Number.isInteger(child.pid) || child.pid <= 0) return childClosed;
    try { process.kill(-child.pid, 0); return false; }
    catch (error) { return error.code === 'ESRCH'; }
  };
  return function run(args, { signal, maxBytes }) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }));
        return;
      }
      const terminationState = { taskkillSucceeded: false };
      let child;
      try { child = spawnImpl('opencode', args, { shell: false, detached: platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (error) { reject(error); return; }
      const chunks = [];
      let bytes = 0;
      let stderrBytes = 0;
      let settled = false;
      let terminating = false;
      let childClosed = false;
      let terminationTimer;
      const clearTermination = () => {
        if (terminationTimer) clearTimeout(terminationTimer);
        terminationTimer = undefined;
      };
      const finish = (callback, value, keepTermination = false) => {
        if (settled) return;
        settled = true;
        if (!keepTermination) clearTermination();
        signal.removeEventListener('abort', abort);
        callback(value);
      };
      const fail = error => finish(reject, error);
      const terminate = error => {
        if (settled) return;
        terminating = true;
        terminationTimer = setTimeout(() => {
          terminationTimer = undefined;
          if (!treeConfirmedClosed(child, childClosed, terminationState)) terminateTree(child, 'SIGKILL', terminationState);
        }, killGraceMs);
        finish(reject, error, true);
        terminateTree(child, 'SIGTERM', terminationState);
        try { child.unref?.(); } catch {}
        try { child.stdout?.unref?.(); } catch {}
        try { child.stderr?.unref?.(); } catch {}
      };
      const abort = () => terminate(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) terminate(Object.assign(new Error('response limit'), { code: 'RESPONSE_LIMIT' }));
        else chunks.push(chunk);
      });
      child.stderr.on('data', chunk => {
        stderrBytes += chunk.length;
        if (stderrBytes > maxBytes) terminate(Object.assign(new Error('response limit'), { code: 'RESPONSE_LIMIT' }));
      });
      child.once('error', error => { if (!terminating || treeConfirmedClosed(child, childClosed, terminationState)) clearTermination(); fail(error); });
      child.once('close', code => {
        childClosed = true;
        if (!terminating || treeConfirmedClosed(child, childClosed, terminationState)) clearTermination();
        finish(resolve, { stdout: Buffer.concat(chunks, bytes), stderr: '', code });
      });
    });
  };
}

const defaultRunner = createRunner();

async function api(runner, args, { timeoutMs, maxResponseBytes, interruptSignal }) {
  if (interruptSignal?.aborted) throw Object.assign(new Error('Usage audit interrupted'), { code: 'INTERRUPTED' });
  const controller = new AbortController();
  const forwardInterrupt = () => controller.abort();
  if (interruptSignal?.aborted) controller.abort();
  else interruptSignal?.addEventListener('abort', forwardInterrupt, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await runner(args, { signal: controller.signal, shell: false, maxBytes: maxResponseBytes });
    const code = result?.code ?? 0;
    if (code !== 0) {
      const failure = new Error(`opencode api ${args[1]} ${args[2]} failed with exit code ${code}`);
      failure.code = 'API_REQUEST';
      throw failure;
    }
    return result?.stdout ?? '';
  } catch (error) {
    if (interruptSignal?.aborted) throw Object.assign(new Error('Usage audit interrupted'), { code: 'INTERRUPTED' });
    if (controller.signal.aborted || error?.code === 'ABORT_ERR') throw Object.assign(new Error(`OpenCode API request timed out after ${timeoutMs}ms`), { code: 'TIMEOUT' });
    if (error?.code === 'ENOENT') throw Object.assign(new Error('OpenCode CLI not found; install/open OpenCode and retry'), { code: 'CLI_MISSING' });
    if (error?.code === 'RESPONSE_LIMIT') throw Object.assign(new Error(`OpenCode API response exceeds the ${maxResponseBytes}-byte limit`), { code: 'RESPONSE_LIMIT' });
    if (error?.code === 'API_REQUEST') throw error;
    throw new Error('OpenCode API request failed; check that the local OpenCode server is available');
  } finally {
    clearTimeout(timer);
    interruptSignal?.removeEventListener('abort', forwardInterrupt);
  }
}

function parseJson(output, label, maxResponseBytes) {
  let bytes;
  try { bytes = Buffer.isBuffer(output) ? output : Buffer.from(String(output), 'utf8'); }
  catch { throw new Error(`Malformed JSON from ${label}`); }
  if (bytes.length > maxResponseBytes) throw new Error(`OpenCode API response exceeds the ${maxResponseBytes}-byte limit`);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error(`Malformed JSON from ${label}`); }
  try { return JSON.parse(text); }
  catch { throw new Error(`Malformed JSON from ${label}`); }
}

function number(value, label, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`Malformed usage data: invalid or unsafe ${label}`);
  }
  return value;
}

function sum(left, right, label, integer = false) {
  const value = left + right;
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`Malformed usage data: unsafe ${label} aggregate`);
  }
  return value;
}

function tokenUsage(value, label) {
  if (!object(value) || !object(value.cache)) throw new Error(`Malformed usage data: invalid ${label} tokens`);
  return {
    input: number(value.input, `${label}.input`),
    output: number(value.output, `${label}.output`),
    reasoning: number(value.reasoning, `${label}.reasoning`),
    cache: { read: number(value.cache.read, `${label}.cache.read`), write: number(value.cache.write, `${label}.cache.write`) },
  };
}

function label(value, name) {
  if (typeof value !== 'string' || !value || value.length > 256 || CONTROL_CHARS.test(value)) throw new Error(`Malformed usage data: invalid ${name}`);
  return value;
}

function modelRef(value) {
  if (!object(value)) throw new Error('Malformed usage data: invalid model');
  const model = { providerID: label(value.providerID, 'model provider'), id: label(value.id, 'model id') };
  if (value.variant !== undefined) model.variant = label(value.variant, 'model variant');
  return model;
}

function toolTotals(value) {
  if (!object(value)) throw new Error('Malformed usage data: invalid tool totals');
  return {
    calls: number(value.calls, 'tools.calls', true), succeeded: number(value.succeeded, 'tools.succeeded', true),
    failed: number(value.failed, 'tools.failed', true), unfinished: number(value.unfinished, 'tools.unfinished', true),
  };
}

function addTokens(left, right) {
  return {
    input: sum(left.input, right.input, 'tokens.input'),
    output: sum(left.output, right.output, 'tokens.output'),
    reasoning: sum(left.reasoning, right.reasoning, 'tokens.reasoning'),
    cache: {
      read: sum(left.cache.read, right.cache.read, 'tokens.cache.read'),
      write: sum(left.cache.write, right.cache.write, 'tokens.cache.write'),
    },
  };
}

function aggregateModels(values, maxRows) {
  if (!Array.isArray(values)) throw new Error('Malformed usage data: models must be an array');
  const result = [];
  const indexes = new Map();
  const omitted = Math.max(0, values.length - maxRows);
  for (const value of values.slice(0, maxRows)) {
    if (!object(value)) throw new Error('Malformed usage data: invalid model usage');
    const model = modelRef(value.model);
    const key = JSON.stringify([model.providerID, model.id, model.variant ?? null]);
    const usage = { model, tokens: tokenUsage(value.tokens, 'model'), cost: number(value.cost, 'model.cost') };
    if (indexes.has(key)) {
      const old = result[indexes.get(key)];
      old.tokens = addTokens(old.tokens, usage.tokens);
      old.cost = sum(old.cost, usage.cost, 'model.cost');
    } else { indexes.set(key, result.length); result.push(usage); }
  }
  return { values: result, omitted };
}

function aggregateTools(value, mode, maxRows) {
  if (!object(value) || value.mode !== mode) throw new Error(`Malformed usage data: tool mode must be ${mode}`);
  if (mode === 'none') return { value: { mode }, omitted: 0 };
  const totals = toolTotals(value.totals);
  if (mode === 'summary') return { value: { mode, totals }, omitted: 0 };
  if (!Array.isArray(value.usage)) throw new Error('Malformed usage data: tool usage must be an array');
  const usage = [];
  const indexes = new Map();
  const omitted = Math.max(0, value.usage.length - maxRows);
  for (const item of value.usage.slice(0, maxRows)) {
    if (!object(item)) throw new Error('Malformed usage data: invalid tool usage');
    const name = label(item.name, 'tool name');
    const counts = toolTotals(item);
    const duration = item.durationP50 === undefined ? undefined : number(item.durationP50, 'tool.durationP50');
    if (indexes.has(name)) {
      const old = usage[indexes.get(name)];
      for (const key of Object.keys(counts)) old[key] = sum(old[key], counts[key], `tools.${key}`, true);
      delete old.durationP50;
    } else {
      const row = { name, ...counts };
      if (duration !== undefined) row.durationP50 = duration;
      indexes.set(name, usage.length); usage.push(row);
    }
  }
  return { value: { mode, totals, usage }, omitted };
}

function normalizeStats(data, { from, to, timezone, tools, maxRows, maxResponseBytes, maxOutputBytes }) {
  if (!object(data)) throw new Error('Malformed usage data: stats payload must be an object');
  if (!object(data.range)) throw new Error('Malformed usage data: missing range');
  number(data.range.from, 'range.from'); number(data.range.to, 'range.to');
  if (data.range.from !== from || data.range.to !== to) throw new Error('Malformed usage data: response range does not match the requested range');
  const models = aggregateModels(data.models, maxRows);
  const aggregatedTools = aggregateTools(data.tools, tools, maxRows);
  return {
    project: null,
    range: { from, to, timezone },
    tokens: tokenUsage(data.tokens, 'total'),
    cost: number(data.cost, 'cost'),
    models: models.values,
    tools: aggregatedTools.value,
    truncation: {
      complete: models.omitted === 0 && aggregatedTools.omitted === 0,
      modelsOmitted: models.omitted, toolsOmitted: aggregatedTools.omitted, outputTrimmed: false,
      maxResponseBytes, maxRows, maxOutputBytes,
    },
  };
}

function trim(report) {
  let removed = 0;
  if (report.models.length) {
    removed = report.models.splice(0, Math.max(1, Math.ceil(report.models.length / 2))).length;
    report.truncation.modelsOmitted += removed;
  } else if (report.tools.usage?.length) {
    removed = report.tools.usage.splice(0, Math.max(1, Math.ceil(report.tools.usage.length / 2))).length;
    report.truncation.toolsOmitted += removed;
  }
  if (!removed) return false;
  report.truncation.outputTrimmed = true;
  report.truncation.complete = false;
  return true;
}

function fitReport(report, maxOutputBytes) {
  const result = structuredClone(report);
  result.truncation.maxOutputBytes = maxOutputBytes;
  while (Buffer.byteLength(JSON.stringify(result)) > maxOutputBytes) {
    if (!trim(result)) throw new Error(`Usage report metadata exceeds the ${maxOutputBytes}-byte output limit`);
  }
  return result;
}

function modelName(model) {
  return `${model.providerID}/${model.id}${model.variant ? `#${model.variant}` : ''}`;
}

function markdownEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/[\\`*_{}\[\]()#+\-.!|<>]/g, '\\$&');
}

function markdown(report) {
  const lines = [
    '# OpenCode usage audit', '',
    `Project: ${markdownEscape(report.project.root)} (${markdownEscape(report.project.id)})`,
    `Range: ${new Date(report.range.from).toISOString()} to ${new Date(report.range.to).toISOString()} (exclusive), ${markdownEscape(report.range.timezone)}`,
    `Tokens: input ${report.tokens.input}; output ${report.tokens.output}; reasoning ${report.tokens.reasoning}; cache read ${report.tokens.cache.read}; cache write ${report.tokens.cache.write}`,
    `Cost (USD): ${report.cost}`, '', '## Models', '',
  ];
  if (!report.models.length) lines.push('No model rows included.');
  for (const row of report.models) lines.push(`- ${markdownEscape(modelName(row.model))}: input ${row.tokens.input}; output ${row.tokens.output}; reasoning ${row.tokens.reasoning}; cache read ${row.tokens.cache.read}; cache write ${row.tokens.cache.write}; cost ${row.cost}`);
  lines.push('', '## Tools', '');
  if (report.tools.mode === 'none') lines.push('Tool reporting disabled by --tools none.');
  else {
    const total = report.tools.totals;
    lines.push(`Totals: calls ${total.calls}; succeeded ${total.succeeded}; failed ${total.failed}; unfinished ${total.unfinished}`);
    if (report.tools.mode === 'detail') {
      if (!report.tools.usage.length) lines.push('No tool rows included.');
      for (const row of report.tools.usage) lines.push(`- ${markdownEscape(row.name)}: calls ${row.calls}; succeeded ${row.succeeded}; failed ${row.failed}; unfinished ${row.unfinished}${row.durationP50 === undefined ? '' : `; duration p50 ${row.durationP50}`}`);
    }
  }
  lines.push('', `Truncation: complete ${report.truncation.complete}; models omitted ${report.truncation.modelsOmitted}; tools omitted ${report.truncation.toolsOmitted}; output trimmed ${report.truncation.outputTrimmed}.`);
  return `${lines.join('\n')}\n`;
}

export function renderUsage(input, format = 'markdown', maxOutputBytes = input.truncation.maxOutputBytes) {
  if (!['markdown', 'json'].includes(format)) throw new InputError('format must be markdown or json');
  positiveInteger(maxOutputBytes, 'maxOutputBytes', 1024 * 1024);
  let report = fitReport(input, maxOutputBytes);
  let output = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : markdown(report);
  while (Buffer.byteLength(output) > maxOutputBytes && trim(report)) {
    output = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : markdown(report);
  }
  if (Buffer.byteLength(output) > maxOutputBytes) {
    report = fitReport(input, maxOutputBytes);
    while (report.models.length || report.tools.usage?.length) trim(report);
    output = format === 'json'
      ? `${JSON.stringify(report, null, 2)}\n`
      : `# OpenCode usage audit\n\nOutput truncated at ${maxOutputBytes} bytes; complete: false.\n`;
    if (Buffer.byteLength(output) > maxOutputBytes) throw new Error(`Usage report metadata exceeds the ${maxOutputBytes}-byte output limit`);
  }
  return output;
}

function comparable(value) {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function resolveLocation(payload, root) {
  if (!object(payload) || typeof payload.directory !== 'string' || !object(payload.project) || typeof payload.project.canonical !== 'string') {
    throw new Error('Malformed location response from GET /api/location');
  }
  if (comparable(payload.project.canonical) !== comparable(root)) {
    throw new Error('Exact location lookup resolved a different canonical project');
  }
  return { root, id: label(payload.project.id, 'project id') };
}

function resolveProject(projects, root) {
  if (!Array.isArray(projects)) throw new Error('Malformed project response from GET /api/project');
  const matches = projects.filter(project => {
    if (!object(project) || typeof project.canonical !== 'string' || !path.isAbsolute(project.canonical)) return false;
    return comparable(project.canonical) === comparable(root);
  });
  if (!matches.length) throw new Error(`Project is not registered with OpenCode: ${root}. Open this project in OpenCode first.`);
  if (matches.length > 1) throw new Error(`Project lookup is ambiguous for canonical root: ${root}`);
  const id = label(matches[0].id, 'project id');
  return { root, id };
}

export async function usageAudit(options = {}, deps = {}) {
  const root = canonicalRoot(options.root ?? process.cwd());
  const days = positiveInteger(options.days ?? DEFAULTS.days, 'days', 3650);
  const tools = options.tools ?? DEFAULTS.tools;
  if (!['none', 'summary', 'detail'].includes(tools)) throw new InputError('tools must be none, summary, or detail');
  const zone = timezone(options.timezone ?? DEFAULTS.timezone);
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0) throw new InputError('now must be a non-negative Unix millisecond timestamp');
  const from = now - days * 86400000;
  if (from < 0) throw new InputError('days extends before the Unix epoch');
  const maxResponseBytes = positiveInteger(options.maxResponseBytes ?? LIMITS.maxResponseBytes, 'maxResponseBytes', 16 * 1024 * 1024);
  const timeoutMs = positiveInteger(options.timeoutMs ?? LIMITS.timeoutMs, 'timeoutMs', 120000);
  const maxRows = positiveInteger(options.maxRows ?? LIMITS.maxRows, 'maxRows', 10000);
  const maxOutputBytes = positiveInteger(options.maxOutputBytes ?? LIMITS.maxOutputBytes, 'maxOutputBytes', 1024 * 1024);
  const runner = deps.runner ?? options.runner ?? defaultRunner;
  const request = { timeoutMs, maxResponseBytes, interruptSignal: options.interruptSignal };
  let project;
  try {
    const locationArgs = ['api', 'location.get', '--param', `location[directory]=${root}`];
    const location = parseJson(await api(runner, locationArgs, request), 'GET /api/location', maxResponseBytes);
    project = resolveLocation(location, root);
  } catch (failure) {
    if (failure.code !== 'API_REQUEST') throw failure;
    const projects = parseJson(await api(runner, ['api', 'GET', '/api/project'], request), 'GET /api/project', maxResponseBytes);
    project = resolveProject(projects, root);
  }
  const args = ['api', 'GET', '/api/experimental/session/stats',
    '--param', `from=${from}`, '--param', `to=${now}`, '--param', `project=${project.id}`,
    '--param', `timezone=${zone}`, '--param', `tools=${tools}`];
  const envelope = parseJson(await api(runner, args, request), 'GET /api/experimental/session/stats', maxResponseBytes);
  if (!object(envelope) || !has(envelope, 'data')) throw new Error('Malformed usage data: missing stats data');
  const report = normalizeStats(envelope.data, { from, to: now, timezone: zone, tools, maxRows, maxResponseBytes, maxOutputBytes });
  report.project = project;
  return fitReport(report, maxOutputBytes);
}

export async function main(argv, deps = {}) {
  let options;
  try { options = parseArgs(argv, deps.now ?? Date.now()); }
  catch (error) { console.error(`Usage audit failed: ${error.message}`); return 1; }
  if (options.help) { console.log(HELP); return 0; }
  const log = deps.log ?? (line => process.stdout.write(line));
  const error = deps.error ?? (line => console.error(line));
  const signalTarget = deps.signalTarget ?? process;
  const interruptController = new AbortController();
  let receivedSignal = null;
  const onSignal = signal => {
    if (receivedSignal) return;
    receivedSignal = signal;
    interruptController.abort();
    error(`Usage audit interrupted by ${signal}`);
  };
  const canHandleSignals = typeof signalTarget?.on === 'function' && typeof signalTarget?.removeListener === 'function';
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  if (canHandleSignals) {
    signalTarget.on('SIGINT', onSigint);
    signalTarget.on('SIGTERM', onSigterm);
  }
  const signalCode = () => receivedSignal === 'SIGINT' ? 130 : receivedSignal === 'SIGTERM' ? 143 : 1;
  try {
    const report = await usageAudit({ ...options, ...deps, interruptSignal: interruptController.signal }, { runner: deps.runner });
    if (receivedSignal) return signalCode();
    log(renderUsage(report, options.format, deps.maxOutputBytes));
    return 0;
  } catch (failure) {
    if (!receivedSignal) error(`Usage audit failed: ${failure.message}`);
    return signalCode();
  } finally {
    if (canHandleSignals) {
      signalTarget.removeListener('SIGINT', onSigint);
      signalTarget.removeListener('SIGTERM', onSigterm);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
