#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import YAML from 'yaml';

const bundle = fileURLToPath(new URL('../bundle/', import.meta.url));
const config = JSON.parse(readFileSync(path.join(bundle, 'opencode.json'), 'utf8'));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
function lineColumnAt(source, offset) {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === '\n') { line++; column = 1; } else column++;
  }
  return { line, column };
}
function yamlIssueFailure(reason, issue, source) {
  const position = issue?.linePos?.[0];
  let line = Number.isInteger(position?.line) ? position.line : null;
  let column = Number.isInteger(position?.col) ? position.col : null;
  if (line === null || column === null) {
    const offset = Array.isArray(issue?.pos) && Number.isInteger(issue.pos[0]) ? issue.pos[0] : null;
    if (offset !== null) ({ line, column } = lineColumnAt(source, offset));
  }
  return line === null || column === null ? reason : `${reason} at line ${line}, column ${column}`;
}
function parseFrontmatter(source) {
  let document;
  try {
    document = YAML.parseDocument(source, { uniqueKeys: true, prettyErrors: false, logLevel: 'silent' });
  } catch (error) {
    throw new Error(yamlIssueFailure('YAML parse failed', error, source));
  }
  const issue = document.errors[0] ?? document.warnings[0];
  if (issue) {
    const reason = document.errors.length ? 'YAML parse failed' : 'YAML warning rejected';
    throw new Error(yamlIssueFailure(reason, issue, source));
  }
  try { return document.toJS(); }
  catch (error) { throw new Error(yamlIssueFailure('YAML conversion failed', error, source)); }
}
const names = directory => readdirSync(path.join(bundle, directory)).filter(f => f.endsWith('.md'));
const definitions = {};
const renderedModelKeys = new Set(['model', 'small_model', 'large_model', 'thinking_model', 'coding_model', 'compaction_model',
  'default_model', 'fast_model', 'fallback_model']);
const sensitiveDirs = new Set(['.git', '.hg', '.svn', '.ssh', '.aws', '.azure', '.gcloud', '.gnupg', '.kube',
  '.password-store', 'node_modules', '.toolkit-backups', '.toolkit-state', 'secrets', 'credentials']);
const sensitiveName = /^(?:\.env(?:\..*)?|.*\.env|\.envrc(?:\..*)?|envkeys|\.npmrc|\.netrc|\.pypirc|\.git-credentials|\.htpasswd|\.kdbx|credentials?(?:\..*)?|secrets?(?:\..*)?|\.?auth(?:\..*)?|.*private[-_]?key.*|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|jks|keystore|kdbx))$/i;
const normalizeKey = key => String(key).toLowerCase().replace(/[_-]/g, '');
const rejectedKeys = new Set(['policy', 'policies', 'automation', 'automations', 'schedules', 'worktree', 'worktrees',
  'warming', 'snapshot', 'snapshots', 'browser', 'account', 'accounts', 'auth', 'credential', 'credentials',
  'enterprise', 'share', 'remote', 'service', 'hook', 'hooks', 'tools', 'provider', 'providers', 'configdir', 'failover',
  'mcp', 'plugins', 'plugin', 'rtk', 'env', 'envs', 'envvars', 'envmap', 'envmaps', 'envfile', 'processenv',
  'dotenv', 'envconfig', 'environmentfile', 'environment', 'environments', 'environmentmap', 'environmentmaps',
  'environmentvars', 'environmentvariables'].map(normalizeKey));
const requestSecretKeys = new Set(['authorization', 'authtoken', 'cookie', 'cookies', 'setcookie', 'headers', 'header', 'body',
  'request', 'requests', 'apitoken', 'accesstoken', 'refreshtoken', 'idtoken', 'sessiontoken', 'oauthtoken', 'bearertoken',
  'clientsecret', 'apikey', 'token', 'password', 'passwd', 'passphrase', 'secret', 'secrets', 'privatekey', 'secretkey',
  'signingkey', 'encryptionkey', 'accesskey', 'accesskeyid', 'secretaccesskey', 'awsaccesskeyid', 'awssecretaccesskey',
  'awssessiontoken', 'awsaccesskey', 'awssecretkey', 'githubtoken', 'githubaccesstoken', 'githubpat',
  'gitlabtoken', 'gitlabaccesstoken', 'gitlabpat', 'npmtoken', 'npmauthtoken', 'npmaccesstoken',
  'gcpserviceaccount', 'gcpserviceaccountkey', 'gcpcredentials', 'gcpapikey', 'googlecredentials',
  'googleapplicationcredentials', 'googleapikey', 'googleprivatekey', 'openaiapikey', 'openaikey', 'openaisecret',
  'anthropicapikey', 'azureopenaikey', 'geminiapikey', 'serviceaccount',
  'serviceaccountkey', 'jwt', 'jwttoken', 'jwtsecret', 'jwtkey', 'jwtaccesstoken', 'credential', 'credentials'].map(normalizeKey));
const credentialValuePatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /\bBasic\s+[A-Za-z0-9+/]{8,}={0,2}\b/i,
  /\bsk-[A-Za-z0-9_-]{8,}/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z_]{16,}\b/,
  /\bxox[baprs]-[A-Za-z0-9_-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bgithub_pat_[A-Za-z0-9_]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{10,}\b/,
  /\bASIA[0-9A-Za-z_]{12,}\b/,
  /\bglpat-[A-Za-z0-9_-]{10,}\b/,
  /\bnpm_[A-Za-z0-9_]{10,}\b/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]{10,}\b/,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/,
  /\b(?:[A-Za-z0-9]+[_-])*(?:client[_-]?secret|auth[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?token|github[_-]?token|gitlab[_-]?token|npm[_-]?token|jwt[_-]?secret|session[_-]?token|id[_-]?token|password|passwd|secret|token|api[_-]?key|access[_-]?key)[A-Za-z0-9_-]*["']?\s*[:=]\s*["']?[^\s"']{6,}/i,
];
function checkExportSafety(value, location = 'config') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    const normalized = normalizeKey(key);
    if (location === 'config.websearch' && lower === 'provider') {
      check(typeof child === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(child) &&
        !credentialValuePatterns.some(pattern => pattern.test(child)), `Invalid websearch provider setting: ${location}.${key}`);
      continue;
    }
    check(!rejectedKeys.has(normalized), `Machine/account autonomy setting exported: ${location}.${key}`);
    check(!requestSecretKeys.has(normalized), `Request or credential-bearing setting exported: ${location}.${key}`);
    check(!(lower === 'update' && child === 'auto'), `Automatic update setting exported: ${location}.${key}`);
    check(!(typeof child === 'string' && credentialValuePatterns.some(pattern => pattern.test(child))), `Literal credential value exported: ${location}.${key}`);
    checkExportSafety(child, `${location}.${key}`);
  }
}
function checkMarkdownSubstitutions(value, label) {
  if (typeof value === 'string') {
    if (value.includes('{env:')) errors.push(`Environment substitution outside approved Markdown system body: ${label}`);
    if (value.includes('{file:')) errors.push(`File substitution outside approved Markdown system body: ${label}`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) checkMarkdownSubstitutions(value[index], `${label}[${index}]`);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key.includes('{env:')) errors.push(`Environment substitution in Markdown frontmatter key: ${label}.${key}`);
      if (key.includes('{file:')) errors.push(`File substitution in Markdown frontmatter key: ${label}.${key}`);
      checkMarkdownSubstitutions(child, `${label}.${key}`);
    }
  }
}
function portableSegments(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return null;
  const portable = value.replaceAll('\\', '/');
  const segments = portable.split('/');
  if (path.posix.normalize(portable) !== portable || segments.some(segment => !segment || segment === '.' || segment === '..' || /[. ]$/.test(segment))) return null;
  return segments;
}
// Linear wildcard matcher mirroring OpenCode: backslashes normalize to
// slashes, matching is case-insensitive, and a trailing " *" also matches the
// phrase without arguments. Avoid regex compilation of attacker-controlled globs.
function globMatches(pattern, target) {
  if (typeof pattern !== 'string') return false;
  const normalize = value => String(value).toLowerCase().replaceAll('\\', '/');
  const glob = normalize(pattern);
  const value = normalize(target);
  if (glob.endsWith(' *') && value === glob.slice(0, -2)) return true;
  let globIndex = 0;
  let valueIndex = 0;
  let starIndex = -1;
  let starValue = 0;
  while (valueIndex < value.length) {
    if (globIndex < glob.length && (glob[globIndex] === '?' || glob[globIndex] === value[valueIndex])) {
      globIndex++; valueIndex++;
    } else if (globIndex < glob.length && glob[globIndex] === '*') {
      starIndex = globIndex++;
      starValue = valueIndex;
    } else if (starIndex !== -1) {
      globIndex = starIndex + 1;
      valueIndex = ++starValue;
    } else return false;
  }
  while (globIndex < glob.length && glob[globIndex] === '*') globIndex++;
  return globIndex === glob.length;
}
function actionMatchesProtected(action) {
  return ['shell', 'browser', 'playwright', 'puppeteer'].some(target => globMatches(action, target));
}
const curatedSkills = ['toolkit-grilling', 'toolkit-handoff', 'toolkit-questionnaire', 'toolkit-diagnosing-bugs', 'toolkit-tdd', 'toolkit-retro'];
const skillNames = new Set();
const skillRoot = path.join(bundle, 'skills');
for (const id of curatedSkills) {
  const file = path.join(skillRoot, id, 'SKILL.md');
  check(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length <= 64, `Nonportable skill ID: ${id}`);
  check(existsSync(file), `Missing curated skill: ${id}`);
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8');
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  check(Boolean(header), `${id}: missing skill frontmatter`);
  if (!header) continue;
  try {
    const parsed = parseFrontmatter(header[1]);
    check(typeof parsed?.name === 'string' && !!parsed.name.trim(), `${id}: missing display name`);
    check(typeof parsed?.description === 'string' && !!parsed.description.trim(), `${id}: missing discovery description`);
    check(!skillNames.has(parsed?.name), `${id}: duplicate skill display name`); skillNames.add(parsed?.name);
    check(parsed?.metadata?.['opencode/autoinvoke'] !== false && parsed?.['disable-model-invocation'] !== true, `${id}: automatic discovery disabled`);
    // V2 IDs come from directory names, not frontmatter display names.
    for (const match of content.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const link = match[1]; if (/^(?:https?:|mailto:|#)/.test(link)) continue;
      const target = path.resolve(path.dirname(file), link.split('#')[0]);
      check(target.startsWith(`${skillRoot}${path.sep}`) && existsSync(target), `${id}: missing/nonportable local reference ${link}`);
    }
  } catch (error) { errors.push(`${id}: ${error.message}`); }
}
if (existsSync(skillRoot)) {
  for (const entry of readdirSync(skillRoot, { withFileTypes: true })) {
    check(!entry.isSymbolicLink(), `Symlinked skill artifact: ${entry.name}`);
    if (entry.isDirectory()) check(curatedSkills.includes(entry.name), `Unexpected skill directory: ${entry.name}`);
  }
}
try {
  const provenance = JSON.parse(readFileSync(path.join(skillRoot, 'provenance.json'), 'utf8'));
  check(provenance.repository === 'https://github.com/mattpocock/skills' && provenance.commit === 'abeeaf95660ba9e8b7c753eb38f441ca707a8823', 'Unrecognized curated skill provenance');
  check(provenance.license === 'MIT' && provenance.runtimeDependencies?.length === 0, 'Curated skills must remain dependency-free MIT content');
  const ids = provenance.skills.map(skill => skill.id);
  check(new Set(ids).size === curatedSkills.length && ids.length === curatedSkills.length && curatedSkills.every(id => ids.includes(id)), 'Incomplete/duplicate curated skill provenance');
  for (const skill of provenance.skills) {
    check(skill.file === `${skill.id}/SKILL.md` && existsSync(path.join(skillRoot, skill.file)), `Invalid skill provenance reference: ${skill.id}`);
    check(Array.isArray(skill.sources) && skill.sources.length > 0 && skill.sources.every(source => typeof source === 'string' && source.startsWith('skills/') && !source.split('/').includes('..')), `Invalid upstream source references: ${skill.id}`);
  }
  check(provenance.licenseFile === 'LICENSE.mattpocock.txt', 'Unexpected upstream license path');
  const license = readFileSync(path.join(skillRoot, 'LICENSE.mattpocock.txt'), 'utf8');
  check(license.includes('Copyright (c) 2026 Matt Pocock') && license.includes('Permission is hereby granted, free of charge'), 'Missing upstream MIT notice');
} catch (error) { errors.push(`Skill provenance/license: ${error.message}`); }
for (const directory of ['agents', 'commands']) {
  definitions[directory] = new Map();
  for (const name of names(directory)) {
    const file = `${directory}/${name}`;
    const body = readFileSync(path.join(bundle, file), 'utf8');
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body);
    check(Boolean(header), `${file}: missing frontmatter`);
    if (!header) continue;
    let parsed;
    try { parsed = parseFrontmatter(header[1]); }
    catch (error) { errors.push(`${file}: ${error.message}`); continue; }
    definitions[directory].set(name.slice(0, -3), parsed);
    check(Boolean(parsed?.description), `${file}: missing description`);
    for (const key of renderedModelKeys) check(!Object.hasOwn(parsed ?? {}, key), `${file}: rendered model selector leaked into raw bundle`);
    checkExportSafety(parsed, file);
    checkMarkdownSubstitutions(parsed, file);
    const seen = new Set();
    checkPermissionRules(parsed.permissions, `${file} permissions`, { agent: true });
    checkPermissionRules(parsed.permission, `${file} singular permission`, { agent: true });
    if (Array.isArray(parsed.permissions)) for (const rule of parsed.permissions) {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
        check(false, `${file}: invalid permission rule`);
        continue;
      }
      const key = `${rule.action}:${rule.resource}`;
      check(!seen.has(key), `${file}: repeated permission ${key}`); seen.add(key);
      check(['allow', 'ask', 'deny'].includes(rule.effect), `${file}: invalid effect`);
      if (parsed.mode === 'subagent') check(!(String(rule.action).toLowerCase() === 'subagent' && rule.effect === 'allow'), `${file}: nested delegation`);
    }
  }
}
const allAgents = new Set(['build', 'plan', 'general', 'explore', ...Object.keys(config.agents), ...definitions.agents.keys()]);
for (const name of definitions.agents.keys()) check(!config.agents[name], `Duplicate agent: ${name}`);
for (const [name, command] of definitions.commands) {
  check(!config.commands?.[name], `Duplicate command: ${name}`);
  if (command.agent) check(allAgents.has(command.agent), `${name}: unknown agent ${command.agent}`);
}
function fileSubstitution(value, location) {
  if (typeof value !== 'string' || !value.includes('{file:')) return null;
  const match = /^\{file:([^{}]+)\}$/.exec(value);
  if (!match) { errors.push(`Unsupported file substitution: ${location}`); return null; }
  return match[1];
}
function promptReferenceProblem(reference) {
  const segments = portableSegments(reference);
  if (!segments) return 'unsafe or non-canonical path';
  if (segments.some(segment => sensitiveDirs.has(segment.toLowerCase()) || sensitiveName.test(segment.toLowerCase()))) return 'sensitive path';
  const target = path.join(bundle, ...segments);
  const inside = path.relative(bundle, target);
  if (inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) return 'escapes bundle';
  let current = bundle;
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) { return error.code === 'ENOENT' ? 'missing prompt' : 'inaccessible prompt'; }
    if (stat.isSymbolicLink()) return 'symlinked path component';
    if (index < segments.length - 1 && !stat.isDirectory()) return 'non-directory path component';
    if (index === segments.length - 1 && !stat.isFile()) return 'not a regular file';
    if (index === segments.length - 1 && stat.nlink !== 1) return 'hard-linked file';
  }
  try {
    const canonicalInside = path.relative(realpathSync(bundle), realpathSync(target));
    if (canonicalInside === '..' || canonicalInside.startsWith(`..${path.sep}`) || path.isAbsolute(canonicalInside)) return 'non-canonical containment';
  } catch { return 'inaccessible prompt'; }
  return null;
}
function approvedFileSubstitutionPath(location) {
  if (location.length !== 3) return false;
  const [map, , field] = location;
  return ((map === 'agents' || map === 'agent') && field === 'system') ||
    ((map === 'commands' || map === 'command') && field === 'template');
}
function scanFileSubstitutions(value, location = [], references = []) {
  if (typeof value === 'string') {
    const label = location.join('.') || 'config';
    if (value.includes('{env:')) {
      errors.push(`Environment substitution in portable config: ${label}`);
      return references;
    }
    if (!value.includes('{file:')) return references;
    if (!approvedFileSubstitutionPath(location)) {
      errors.push(`File substitution outside approved agent.system/command.template path: ${label}`);
      return references;
    }
    const reference = fileSubstitution(value, label);
    if (reference) references.push(reference);
    return references;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) scanFileSubstitutions(value[index], [...location, String(index)], references);
    return references;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key.includes('{env:')) errors.push(`Environment substitution in config key: ${[...location, key].join('.')}`);
      if (key.includes('{file:')) errors.push(`File substitution in config key: ${[...location, key].join('.')}`);
      scanFileSubstitutions(child, [...location, key], references);
    }
  }
  return references;
}
for (const reference of scanFileSubstitutions(config)) {
  const problem = promptReferenceProblem(reference);
  check(!problem, `Invalid prompt reference ${reference}: ${problem}`);
}
function instructionProblem(instruction) {
  if (typeof instruction !== 'string') return 'nonportable instruction path';
  const portable = instruction.replaceAll('\\', '/');
  if (!portable.startsWith('.opencode/')) return 'nonportable instruction path';
  const segments = portableSegments(portable.slice('.opencode/'.length));
  if (!segments) return 'unsafe instruction path';
  if (segments.some(segment => sensitiveDirs.has(segment.toLowerCase()) || sensitiveName.test(segment.toLowerCase()))) return 'sensitive instruction path';
  let current = bundle;
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) { return error.code === 'ENOENT' ? 'missing instruction' : 'inaccessible instruction'; }
    if (stat.isSymbolicLink()) return 'symlinked instruction';
    if (index < segments.length - 1 && !stat.isDirectory()) return 'non-directory instruction component';
    if (index === segments.length - 1 && (!stat.isFile() || stat.nlink !== 1)) return 'unsafe instruction file';
  }
  return null;
}
check(Array.isArray(config.instructions), 'Instructions must be an array');
for (const instruction of Array.isArray(config.instructions) ? config.instructions : []) {
  const problem = instructionProblem(instruction);
  check(!problem, `Invalid instruction ${String(instruction)}: ${problem}`);
}
check(config.experimental.subagent_depth === 1, 'Delegation must be shallow');
check(!config.mcp && !config.plugins && !config.plugin && !config.rtk && !config.experimental?.rtk && !config.experimental?.hooks,
  'Machine-specific MCP/plugin/RTK rewrite integration exported');
checkExportSafety(config);
check(Object.keys(config.experimental ?? {}).every(key => key === 'subagent_depth'), 'Unreviewed experimental autonomy setting exported');
function permissionRules(value, location) {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && (Object.hasOwn(value, 'action') || Object.hasOwn(value, 'resource') || Object.hasOwn(value, 'effect'))) return [value];
  errors.push(`Legacy singular permission map refused: ${location}`);
  return [];
}
function checkPermissionRules(value, location, { agent = false } = {}) {
  for (const rule of permissionRules(value, location)) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      check(false, `Invalid permission rule: ${location}`);
      continue;
    }
    const keys = Object.keys(rule);
    check(keys.length === 3 && ['action', 'resource', 'effect'].every(key => Object.hasOwn(rule, key)), `Invalid or mixed canonical/V1 permission rule: ${location}`);
    check(typeof rule.action === 'string' && typeof rule.resource === 'string' && ['allow', 'ask', 'deny'].includes(rule.effect), `Invalid permission rule: ${location}`);
    const action = String(rule.action ?? '').toLowerCase();
    check(!(/browser|playwright|puppeteer/i.test(`${rule.action ?? ''} ${rule.resource ?? ''}`) && ['allow', 'ask'].includes(rule.effect)), `Browser permission exported: ${location}`);
    check(!(['allow', 'ask'].includes(rule.effect) && actionMatchesProtected(action) && (agent || action !== 'shell')), `Agent shell or wildcard grant exported: ${location}`);
  }
}
checkPermissionRules(config.permissions, 'permissions');
checkPermissionRules(config.permission, 'permission');
for (const map of ['agents', 'agent']) for (const [name, definition] of Object.entries(config[map] ?? {})) {
  if (definition && typeof definition === 'object' && !Array.isArray(definition)) {
    checkPermissionRules(definition.permissions, `${map}.${name}.permissions`, { agent: true });
    checkPermissionRules(definition.permission, `${map}.${name}.permission`, { agent: true });
  }
}
const compaction = config.compaction;
const compactionKeys = new Set(['auto', 'keep', 'buffer', 'background']);
check(Boolean(compaction) && typeof compaction === 'object' && !Array.isArray(compaction) && Object.keys(compaction).every(key => compactionKeys.has(key)), 'Invalid canonical compaction profile shape');
check(compaction?.auto === true && compaction?.background === false, 'Compaction auto/background defaults are invalid');
check(Number.isSafeInteger(compaction?.keep?.tokens) && compaction.keep.tokens > 0 && Object.keys(compaction.keep ?? {}).every(key => key === 'tokens'), 'Compaction keep.tokens must be a positive integer with no extra fields');
check(typeof compaction?.buffer === 'string' && /^(?:[1-9][0-9]?|100)%$/.test(compaction.buffer), 'Compaction buffer must be a percentage');
const output = config.tool_output;
check(Boolean(output) && typeof output === 'object' && !Array.isArray(output) && Object.keys(output).every(key => ['max_lines', 'max_bytes'].includes(key)), 'Invalid canonical tool_output profile shape');
check(Number.isSafeInteger(output?.max_lines) && output.max_lines > 0 && Number.isSafeInteger(output?.max_bytes) && output.max_bytes > 0, 'Tool output caps must be positive integers');
function assertModelNeutral(value, location = 'config') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    check(!renderedModelKeys.has(key), `Rendered model selector leaked into raw bundle: ${location}.${key}`);
    assertModelNeutral(child, `${location}.${key}`);
  }
}
assertModelNeutral(config);
check(config.agents?.compaction === undefined, 'Rendered compaction agent leaked into raw bundle');
for (const file of ['tools/task-state.mjs', 'tools/task-state.test.mjs', 'tools/task-state.md',
  'commands/usage-audit.md', 'tools/usage-audit.mjs', 'tools/usage-audit.md', 'tools/usage-audit.test.mjs']) {
  check(existsSync(path.join(bundle, file)), `Missing required local artifact: ${file}`);
}
if (existsSync(path.join(bundle, 'tools/usage-audit.mjs'))) {
  const source = readFileSync(path.join(bundle, 'tools/usage-audit.mjs'), 'utf8');
  check(!/shell:\s*true|\bexecFileSync\(|\bexec\(/.test(source), 'Usage audit must use argv-only process execution');
  check(source.includes("'location.get'") && source.includes("'/api/project'") && source.includes("'/api/experimental/session/stats'"), 'Usage audit API contract endpoints are missing');
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) check(match[1].startsWith('node:'), `Usage audit has a non-builtin dependency: ${match[1]}`);
}
if (existsSync(path.join(bundle, 'commands/usage-audit.md'))) {
  const command = readFileSync(path.join(bundle, 'commands/usage-audit.md'), 'utf8');
  check(command.includes('.opencode/tools/usage-audit.md') && command.includes('node .opencode/tools/usage-audit.mjs'), 'Usage audit command must point to its standalone guide/tool');
}
try {
  const pkg = JSON.parse(readFileSync(path.join(bundle, '../package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(bundle, '../package-lock.json'), 'utf8'));
  check(pkg.version === '0.2.0' && lock.version === '0.2.0' && lock.packages?.['']?.version === '0.2.0', 'Package/lock version must be 0.2.0');
  for (const file of ['ATTRIBUTION.md', 'CHANGELOG.md', 'docs/']) check(pkg.files?.includes(file), `Package allowlist must include ${file}`);
} catch (error) { errors.push(`Package metadata: ${error.message}`); }
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Valid bundle: ${definitions.agents.size} custom roles, ${Object.keys(config.agents).length} retained agents, ${definitions.commands.size} commands, ${curatedSkills.length} curated skills.`);
