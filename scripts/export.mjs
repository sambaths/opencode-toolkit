import { randomUUID } from 'node:crypto';
import {
  closeSync, constants as fsConstants, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, opendirSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Explicit allowlist: never copy a whole project or its .opencode directory.
// Pure Node path checks reduce but cannot eliminate OS-level TOCTOU when another
// process concurrently replaces a parent directory between path-based syscalls.
const sourceInput = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node scripts/export.mjs <source-.opencode-directory>');
const destinationInput = fileURLToPath(new URL('../bundle/', import.meta.url));
const RENDERED_MODEL_KEYS = new Set(['model', 'small_model', 'large_model', 'thinking_model', 'coding_model', 'compaction_model',
  'default_model', 'fast_model', 'fallback_model']);
const MAX_EXPORT_ENTRIES = 512;
const MAX_EXPORT_TRAVERSAL_ENTRIES = 512;
const MAX_EXPORT_DEPTH = 32;
const traversalState = { entries: 0 };
const MAX_EXPORT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_EXPORT_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_EXPORT_METADATA_BYTES = 1024 * 1024;
const SENSITIVE_DIRS = new Set(['.git', '.hg', '.svn', '.ssh', '.aws', '.azure', '.gcloud', '.gnupg', '.kube',
  '.password-store', 'node_modules', '.toolkit-backups', '.toolkit-state', 'secrets', 'credentials']);
const SENSITIVE_NAME = /^(?:\.env(?:\..*)?|.*\.env|\.envrc(?:\..*)?|envkeys|\.npmrc|\.netrc|\.pypirc|\.git-credentials|\.htpasswd|\.kdbx|credentials?(?:\..*)?|secrets?(?:\..*)?|\.?auth(?:\..*)?|.*private[-_]?key.*|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|jks|keystore|kdbx))$/i;

function lstatIfExists(file) {
  try { return lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function assertSensitiveSegments(segments) {
  for (const segment of segments) {
    if (/[. ]$/.test(segment)) throw new Error(`Refusing Windows path alias segment: ${segment}`);
    const lower = segment.toLowerCase();
    if (SENSITIVE_DIRS.has(lower) || SENSITIVE_NAME.test(lower)) throw new Error(`Refusing sensitive export path component: ${segment}`);
  }
}

function assertNoSymlinkComponents(absolute) {
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Refusing symlinked export path: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function canonicalSource(input) {
  assertNoSymlinkComponents(input);
  assertSensitiveSegments(input.split(path.sep).filter(Boolean));
  const root = realpathSync(input);
  assertSensitiveSegments(root.split(path.sep).filter(Boolean));
  if (!lstatSync(root).isDirectory()) throw new Error('Export source must be a directory');
  return root;
}

function canonicalDestination(input) {
  const absolute = path.resolve(input);
  let current = absolute;
  const missing = [];
  while (!lstatIfExists(current)) {
    missing.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) throw new Error('Cannot resolve export destination');
    current = parent;
  }
  assertNoSymlinkComponents(current);
  let root = realpathSync(current);
  for (const segment of missing) root = path.join(root, segment);
  return root;
}

function normalizeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    throw new Error(`Refusing absolute or invalid export path: ${String(value)}`);
  }
  const portable = value.replaceAll('\\', '/');
  const normalized = path.posix.normalize(portable);
  const segments = portable.split('/');
  if (normalized !== portable || segments.some(segment => !segment || segment === '.' || segment === '..' || /[. ]$/.test(segment))) {
    throw new Error(`Refusing traversal, Windows alias, or non-canonical export path: ${value}`);
  }
  return segments.join(path.sep);
}

function isDefinitionPath(relative, root = '') {
  const segments = relative.split(path.sep);
  return root ? segments[0] === root : segments[0] === 'agents' || segments[0] === 'commands';
}

function assertSensitive(relative) {
  assertSensitiveSegments(relative.split(path.sep));
}

function confine(root, file) {
  const relative = path.relative(root, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Export path escapes approved root: ${file}`);
}

function sourceDirectory(root, value) {
  const relative = normalizeRelative(value);
  assertSensitive(relative);
  const directory = path.join(root, relative);
  confine(root, directory);
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Missing allowlisted export directory: ${relative}`);
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlinked export directory: ${relative}`);
    if (!stat.isDirectory()) throw new Error(`Export source is not a directory: ${relative}`);
  }
  return directory;
}

function readdirBounded(directory) {
  const handle = opendirSync(directory);
  const entries = [];
  try {
    while (true) {
      const entry = handle.readSync();
      if (!entry) break;
      if (entries.length >= MAX_EXPORT_ENTRIES || ++traversalState.entries > MAX_EXPORT_TRAVERSAL_ENTRIES) {
        throw new Error(`Export exceeds the ${MAX_EXPORT_TRAVERSAL_ENTRIES}-entry traversal budget`);
      }
      entries.push(entry);
    }
  } finally { handle.closeSync(); }
  return entries;
}

function sourceFileInfo(root, value) {
  const relative = normalizeRelative(value);
  assertSensitive(relative);
  const file = path.join(root, relative);
  confine(root, file);
  const segments = relative.split(path.sep);
  let current = root;
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Missing allowlisted export source: ${relative}`);
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlinked export source: ${relative}`);
    if (index < segments.length - 1 && !stat.isDirectory()) throw new Error(`Export source path component is not a directory: ${relative}`);
    if (index === segments.length - 1) {
      if (!stat.isFile()) throw new Error(`Export source is not a regular file: ${relative}`);
      if (stat.nlink !== 1) throw new Error(`Refusing hard-linked export source: ${relative}`);
      return { file, stat, relative };
    }
  }
  throw new Error(`Missing allowlisted export source: ${relative}`);
}

function sourceFile(root, value) {
  return sourceFileInfo(root, value).file;
}

function destinationFile(root, value) {
  const relative = normalizeRelative(value);
  assertSensitive(relative);
  const file = path.join(root, relative);
  confine(root, file);
  const segments = relative.split(path.sep);
  let current = root;
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]);
    const stat = lstatIfExists(current);
    if (!stat) continue;
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlinked export destination: ${relative}`);
    if (index < segments.length - 1 && !stat.isDirectory()) throw new Error(`Export destination component is not a directory: ${relative}`);
    if (index === segments.length - 1) {
      if (!stat.isFile()) throw new Error(`Export destination is not a regular file: ${relative}`);
      if (stat.nlink !== 1) throw new Error(`Refusing hard-linked export destination: ${relative}`);
    }
  }
  return file;
}

function assertCanonicalParent(file, label) {
  if (realpathSync(path.dirname(file)) !== path.dirname(file)) throw new Error(`Refusing symlinked export parent: ${label}`);
}

function sameIdentity(actual, expected) {
  return actual.dev === expected.dev && actual.ino === expected.ino;
}

function readSourceFile(root, value, encoding, maxBytes = MAX_EXPORT_FILE_BYTES) {
  const { file, stat: expected } = sourceFileInfo(root, value);
  if (expected.size > maxBytes) throw new Error(`Export source exceeds the ${maxBytes}-byte file limit: ${value}`);
  assertCanonicalParent(file, value);
  let fd;
  try {
    fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || !sameIdentity(stat, expected)) throw new Error(`Refusing changed or hard-linked export source: ${value}`);
    assertCanonicalParent(file, value);
    const chunks = [];
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let total = 0;
    while (true) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, maxBytes + 1 - total), null);
      if (count === 0) break;
      total += count;
      if (total > maxBytes) throw new Error(`Export source exceeds the ${maxBytes}-byte file limit: ${value}`);
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    assertCanonicalParent(file, value);
    const bytes = Buffer.concat(chunks, total);
    if (!encoding) return bytes;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error(`Export source is not valid UTF-8: ${value}`); }
  } catch (error) {
    if (error.code === 'ELOOP') throw new Error(`Refusing symlinked export source: ${value}`);
    throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}

function atomicWrite(destinationRoot, relative, content) {
  const output = path.join(destinationRoot, relative);
  const parent = path.dirname(output);
  let directoryFD;
  let directoryIdentity = null;
  let directoryAlias = null;
  let fd;
  let temporaryStat;
  const verifyParent = () => {
    destinationFile(destinationRoot, relative);
    const currentParent = lstatIfExists(parent);
    if (currentParent) {
      assertCanonicalParent(output, relative);
      if (directoryIdentity && !sameIdentity(currentParent, directoryIdentity)) throw new Error(`Export destination directory identity changed: ${relative}`);
    }
  };
  verifyParent();
  mkdirSync(parent, { recursive: true });
  verifyParent();
  const current = lstatIfExists(output);
  const mode = current ? current.mode & 0o777 : 0o644;
  const temporaryName = `.${path.basename(output)}.${process.pid}.${randomUUID()}.tmp`;
  const temporary = path.join(parent, temporaryName);
  try {
    if (process.platform !== 'win32') {
      const expectedDirectory = lstatSync(parent);
      directoryFD = openSync(parent, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0));
      const openedDirectory = fstatSync(directoryFD);
      if (!openedDirectory.isDirectory() || !sameIdentity(openedDirectory, expectedDirectory)) throw new Error(`Export destination directory identity changed: ${relative}`);
      directoryIdentity = expectedDirectory;
      const aliasRoot = process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd';
      if (lstatIfExists(aliasRoot)?.isDirectory()) directoryAlias = path.join(aliasRoot, String(directoryFD));
    }
    // Directory-fd aliases keep staged writes and cleanup bound to the original
    // directory even if another process swaps the pathname after temp creation.
    // Platforms without a usable alias retain the documented path-based TOCTOU.
    const stagedPath = directoryAlias ? path.join(directoryAlias, temporaryName) : temporary;
    const promotedPath = directoryAlias ? path.join(directoryAlias, path.basename(output)) : output;
    verifyParent();
    fd = openSync(stagedPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), mode);
    temporaryStat = fstatSync(fd);
    verifyParent();
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    verifyParent();
    const staged = lstatIfExists(stagedPath);
    if (!staged || !staged.isFile() || staged.nlink !== 1 || !sameIdentity(staged, temporaryStat)) {
      throw new Error(`Export temporary file identity changed before promotion: ${relative}`);
    }
    renameSync(stagedPath, promotedPath);
    verifyParent();
    const promoted = lstatIfExists(promotedPath);
    if (!promoted || !sameIdentity(promoted, temporaryStat)) throw new Error(`Export destination identity changed during promotion: ${relative}`);
  } finally {
    if (fd !== undefined) closeSync(fd);
    try {
      if (directoryAlias) {
        try { unlinkSync(path.join(directoryAlias, temporaryName)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      } else if (lstatIfExists(temporary)) unlinkSync(temporary);
    } finally { if (directoryFD !== undefined) closeSync(directoryFD); }
  }
}

const source = canonicalSource(sourceInput);
const destination = canonicalDestination(destinationInput);
let config = JSON.parse(readSourceFile(source, 'opencode.json', 'utf8', MAX_EXPORT_METADATA_BYTES));
const STRIPPED_MACHINE_KEYS = new Set(['mcp', 'plugins', 'plugin', 'rtk']);
const normalizeKey = key => String(key).toLowerCase().replace(/[_-]/g, '');
const rejectedKeys = new Set(['policy', 'policies', 'automation', 'automations', 'schedules', 'worktree', 'worktrees',
  'warming', 'snapshot', 'snapshots', 'browser', 'account', 'accounts', 'auth', 'credential', 'credentials',
  'enterprise', 'share', 'remote', 'service', 'hook', 'hooks', 'tools', 'provider', 'providers', 'configdir', 'failover',
  'mcp', 'plugins', 'plugin', 'rtk', 'env', 'envs', 'envvars', 'envmap', 'envmaps', 'envfile', 'processenv',
  'dotenv', 'envconfig', 'environmentfile', 'environment', 'environments', 'environmentmap', 'environmentmaps',
  'environmentvars', 'environmentvariables'].map(normalizeKey));
// These key names can carry live credentials or request bodies. Reject them
// before the string scan or any destination write instead of exporting values.
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
const CREDENTIAL_VALUE_PATTERNS = [
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
function assertNoCredentialValue(value, label) {
  if (typeof value !== 'string') return;
  if (CREDENTIAL_VALUE_PATTERNS.some(pattern => pattern.test(value))) {
    throw new Error(`Refusing to export literal credential value at ${label}`);
  }
}
function assertExportSafe(value, location = 'config') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    const normalized = normalizeKey(key);
    if (location === 'config' && STRIPPED_MACHINE_KEYS.has(lower)) continue;
    if (location === 'config.experimental' && lower === 'rtk') continue;
    if (location === 'config.websearch' && lower === 'provider') {
      if (typeof child !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(child)) {
        throw new Error(`Refusing to export non-scalar or invalid websearch provider: ${location}.${key}`);
      }
      assertNoCredentialValue(child, `${location}.${key}`);
      continue;
    }
    if (rejectedKeys.has(normalized)) throw new Error(`Refusing to export machine/account autonomy setting: ${location}.${key}`);
    if (requestSecretKeys.has(normalized)) throw new Error(`Refusing to export request or credential-bearing setting: ${location}.${key}`);
    if (lower === 'update' && child === 'auto') throw new Error(`Refusing to export automatic update setting: ${location}.${key}`);
    assertNoCredentialValue(child, `${location}.${key}`);
    assertExportSafe(child, `${location}.${key}`);
  }
}
assertExportSafe(config);
if (config.experimental && typeof config.experimental === 'object') {
  for (const key of Object.keys(config.experimental)) {
    if (key.toLowerCase() === 'rtk') continue;
    if (key !== 'subagent_depth') throw new Error(`Refusing to export unreviewed experimental setting: experimental.${key}`);
  }
}
function permissionRules(value, location) {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && (Object.hasOwn(value, 'action') || Object.hasOwn(value, 'resource') || Object.hasOwn(value, 'effect'))) return [value];
  throw new Error(`Refusing to export legacy singular permission map at ${location}`);
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

function assertPermissionRules(value, location, { agent = false } = {}) {
  for (const rule of permissionRules(value, location)) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error(`Refusing invalid permission rule at ${location}`);
    const keys = Object.keys(rule);
    if (keys.length !== 3 || !['action', 'resource', 'effect'].every(key => Object.hasOwn(rule, key))) {
      throw new Error(`Refusing to export invalid or mixed canonical/V1 permission rule at ${location}`);
    }
    if (typeof rule.action !== 'string' || typeof rule.resource !== 'string' || !['allow', 'ask', 'deny'].includes(rule.effect)) {
      throw new Error(`Refusing to export invalid permission rule at ${location}`);
    }
    const action = rule.action.toLowerCase();
    if (['allow', 'ask'].includes(rule.effect) && /browser|playwright|puppeteer/i.test(`${rule.action ?? ''} ${rule.resource ?? ''}`)) {
      throw new Error(`Refusing to export browser permissions at ${location}`);
    }
    // The explicit global shell baseline remains portable. Agent grants and
    // glob patterns that can approximate that baseline do not.
    if (['allow', 'ask'].includes(rule.effect) && actionMatchesProtected(action) && (agent || action !== 'shell')) {
      throw new Error(`Refusing to export agent shell or wildcard grant at ${location}`);
    }
  }
}
assertPermissionRules(config.permissions, 'permissions');
assertPermissionRules(config.permission, 'permission');
for (const map of ['agents', 'agent']) {
  for (const [name, definition] of Object.entries(config[map] ?? {})) {
    if (definition && typeof definition === 'object' && !Array.isArray(definition)) {
      assertPermissionRules(definition.permissions, `${map}.${name}.permissions`, { agent: true });
      assertPermissionRules(definition.permission, `${map}.${name}.permission`, { agent: true });
    }
  }
}
// Scan the complete source config before stripping machine-specific fields so
// hidden substitutions cannot disappear during canonicalization.
const configFileReferences = scanFileSubstitutions(config);
if (!Array.isArray(config.instructions)) throw new Error('Refusing to export non-array instructions');
const instructionFiles = [];
for (const instruction of config.instructions) {
  if (typeof instruction !== 'string' || !instruction.startsWith('.opencode/') || instruction.includes('\\')) {
    throw new Error('Refusing nonportable instruction path');
  }
  const relative = normalizeRelative(instruction.slice('.opencode/'.length));
  assertSensitive(relative);
  sourceFile(source, relative);
  instructionFiles.push(relative);
}
const manifestPath = path.join(source, 'toolkit-manifest.json');
if (lstatIfExists(manifestPath)) {
  const manifest = JSON.parse(readSourceFile(source, 'toolkit-manifest.json', 'utf8', MAX_EXPORT_METADATA_BYTES));
  if (manifest.format === 2 && manifest.profiles && Object.values(manifest.profiles).some(value => value === false)) {
    throw new Error('Cannot export canonical defaults from an opted-out source; re-enable all optimization profiles first');
  }
}
function stripRenderedModels(value) {
  if (Array.isArray(value)) return value.map(stripRenderedModels);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (!RENDERED_MODEL_KEYS.has(key)) result[key] = stripRenderedModels(child);
  }
  return result;
}
config = stripRenderedModels(config);
delete config.agents?.compaction;
// Canonical bundle profiles are always default-on and model-neutral. An
// installed source may omit them or contain rendered/customized values.
config.compaction = { auto: true, keep: { tokens: 15000 }, buffer: '15%', background: false };
config.tool_output = { max_lines: 2000, max_bytes: 51200 };
function deleteCaseInsensitive(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (keys.has(key.toLowerCase())) delete value[key];
}
deleteCaseInsensitive(config, STRIPPED_MACHINE_KEYS);
deleteCaseInsensitive(config.experimental, new Set(['rtk']));
function fileSubstitution(value, location) {
  if (typeof value !== 'string' || !value.includes('{file:')) return null;
  const match = /^\{file:([^{}]+)\}$/.exec(value);
  if (!match) throw new Error(`Unsupported file substitution at ${location}`);
  return match[1];
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
    if (value.includes('{env:')) throw new Error(`Refusing to export environment substitution at ${label}`);
    if (!value.includes('{file:')) return references;
    if (!approvedFileSubstitutionPath(location)) {
      throw new Error(`Refusing to export file substitution outside approved agent.system/command.template path at ${label}`);
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
      if (key.includes('{env:')) throw new Error(`Refusing to export environment substitution in config key at ${[...location, key].join('.')}`);
      if (key.includes('{file:')) throw new Error(`Refusing to export file substitution in config key at ${[...location, key].join('.')}`);
      scanFileSubstitutions(child, [...location, key], references);
    }
  }
  return references;
}

const commands = [
  'build-fix', 'code-review', 'e2e', 'go-build', 'go-review', 'go-test',
  'orchestrate', 'plan', 'refactor-clean', 'rust-build', 'rust-review', 'rust-test',
  'security-scan', 'security', 'tdd', 'test-coverage', 'update-codemaps',
  'update-docs', 'verify', 'council', 'harness-audit', 'setup-pm', 'skill-create', 'usage-audit', 'domain-onramp',
];
const files = [
  ...instructionFiles,
  ...readdirBounded(sourceDirectory(source, 'agents')).filter(entry => entry.name.endsWith('.md')).map(entry => `agents/${entry.name}`),
  ...commands.map(f => `commands/${f}.md`),
  'instructions/INSTRUCTIONS.md', 'tools/evaluate-skill.mjs',
  'tools/evaluate-skill.test.mjs', 'tools/harness-config.test.mjs',
  'tools/context-tools.mjs', 'tools/context-tools.test.mjs', 'tools/context-tools.md',
  'tools/plan-first.test.mjs', 'tools/rtk.md', 'tools/rtk-install.md',
  'tools/usage-audit.mjs', 'tools/usage-audit.test.mjs', 'tools/usage-audit.md',
  'tools/task-state.mjs', 'tools/task-state.test.mjs', 'tools/task-state.md',
  'skills/LICENSE.mattpocock.txt', 'skills/LICENSE.ecc.txt', 'skills/provenance.json',
  ...configFileReferences,
];
const curatedSkills = ['toolkit-grilling', 'toolkit-handoff', 'toolkit-questionnaire', 'toolkit-diagnosing-bugs', 'toolkit-tdd', 'toolkit-retro',
  'toolkit-writing-for-agents', 'toolkit-codebase-design', 'toolkit-domain-modeling', 'toolkit-github-ops'];
function skillFiles(relative, depth = 0) {
  if (depth > MAX_EXPORT_DEPTH) throw new Error(`Export exceeds the ${MAX_EXPORT_DEPTH}-level recursion limit`);
  return readdirBounded(sourceDirectory(source, relative)).flatMap(entry => {
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw new Error(`Unsupported skill entry: ${relative}/${entry.name}`);
    const name = path.join(relative, entry.name);
    return entry.isDirectory() ? skillFiles(name, depth + 1) : [name];
  });
}
for (const id of curatedSkills) files.push(...skillFiles(`skills/${id}`));
const uniqueFiles = [...new Set(files)];
function modelNeutralMarkdown(content, relative) {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!header) throw new Error(`Markdown requires frontmatter: ${relative}`);
  const neutral = header[1].replace(/^(?:model|small_model|large_model|thinking_model|coding_model|compaction_model|default_model|fast_model|fallback_model)\s*:.*(?:\r?\n|$)/gm, '');
  return `---\n${neutral}${neutral.endsWith('\n') ? '' : '\n'}---\n${content.slice(header[0].length)}`;
}

let yamlModule;
function projectYaml() {
  if (yamlModule) return yamlModule;
  for (const base of [import.meta.url, path.join(process.cwd(), 'package.json')]) {
    try { yamlModule = createRequire(base)('yaml'); return yamlModule; }
    catch (error) { if (error?.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  throw new Error('YAML parser unavailable; refusing unsupported agent frontmatter');
}

function assertMarkdownSubstitutions(value, label) {
  if (typeof value === 'string') {
    if (value.includes('{env:')) throw new Error(`Refusing to export environment substitution in Markdown frontmatter: ${label}`);
    if (value.includes('{file:')) throw new Error(`Refusing to export file substitution in Markdown frontmatter: ${label}`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) assertMarkdownSubstitutions(value[index], `${label}[${index}]`);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key.includes('{env:')) throw new Error(`Refusing to export environment substitution in Markdown frontmatter key: ${label}.${key}`);
      if (key.includes('{file:')) throw new Error(`Refusing to export file substitution in Markdown frontmatter key: ${label}.${key}`);
      assertMarkdownSubstitutions(child, `${label}.${key}`);
    }
  }
}

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

function parseMarkdownYaml(source, relative) {
  let document;
  try {
    document = projectYaml().parseDocument(source, { uniqueKeys: true, prettyErrors: false, logLevel: 'silent' });
  } catch (error) {
    throw new Error(`Invalid Markdown frontmatter at ${relative}: ${yamlIssueFailure('YAML parse failed', error, source)}`);
  }
  const issue = document.errors[0] ?? document.warnings[0];
  if (issue) {
    const reason = document.errors.length ? 'YAML parse failed' : 'YAML warning rejected';
    throw new Error(`Invalid Markdown frontmatter at ${relative}: ${yamlIssueFailure(reason, issue, source)}`);
  }
  try { return document.toJS(); }
  catch (error) { throw new Error(`Invalid Markdown frontmatter at ${relative}: ${yamlIssueFailure('YAML conversion failed', error, source)}`); }
}

function assertMarkdownPermissions(content, relative) {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!header) throw new Error(`Markdown requires frontmatter: ${relative}`);
  const parsed = parseMarkdownYaml(header[1], relative);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Invalid Markdown frontmatter at ${relative}`);
  // The Markdown body is the approved agent system prompt. Frontmatter is
  // configuration, so it gets the same export-safety, credential, and file
  // substitution checks as JSON config before any destination write.
  assertExportSafe(parsed, relative);
  assertMarkdownSubstitutions(parsed, relative);
  assertPermissionRules(parsed.permissions, `${relative} frontmatter permissions`, { agent: true });
  assertPermissionRules(parsed.permission, `${relative} frontmatter permission`, { agent: true });
}
// Complete every path check, identity/size preflight, and bounded read before the first write.
if (uniqueFiles.length + 1 > MAX_EXPORT_ENTRIES) throw new Error(`Export exceeds the ${MAX_EXPORT_ENTRIES}-entry limit`);
const sourceInfos = uniqueFiles.map(relative => ({ relative, ...sourceFileInfo(source, relative) }));
const sourceBytes = sourceInfos.reduce((total, info) => total + info.stat.size, 0);
if (sourceBytes > MAX_EXPORT_TOTAL_BYTES) throw new Error(`Export exceeds the ${MAX_EXPORT_TOTAL_BYTES}-byte aggregate limit`);
let actualBytes = 0;
const prepared = sourceInfos.map(({ relative }) => {
  destinationFile(destination, relative);
  const markdown = isDefinitionPath(relative) && relative.endsWith('.md');
  let content;
  if (markdown) {
    const raw = readSourceFile(source, relative, 'utf8');
    actualBytes += Buffer.byteLength(raw);
    if (isDefinitionPath(relative)) assertMarkdownPermissions(raw, relative);
    content = Buffer.from(modelNeutralMarkdown(raw, relative));
  } else {
    content = readSourceFile(source, relative);
    actualBytes += content.length;
  }
  if (actualBytes > MAX_EXPORT_TOTAL_BYTES) throw new Error(`Export exceeds the ${MAX_EXPORT_TOTAL_BYTES}-byte actual aggregate limit`);
  return { relative, content };
});
const configContent = `${JSON.stringify(config, null, 2)}\n`;
actualBytes += Buffer.byteLength(configContent);
if (actualBytes > MAX_EXPORT_TOTAL_BYTES) throw new Error(`Export exceeds the ${MAX_EXPORT_TOTAL_BYTES}-byte actual aggregate limit`);
// Reject an unsafe final config destination before promoting any other file.
destinationFile(destination, 'opencode.json');
if (lstatIfExists(destination)) assertCanonicalParent(path.join(destination, 'opencode.json'), 'opencode.json');
for (const entry of prepared) atomicWrite(destination, entry.relative, entry.content);
atomicWrite(destination, 'opencode.json', configContent);
console.log(`Exported ${prepared.length + 1} allowlisted files; canonical optimization defaults retained, rendered models removed, and machine MCP/plugin/RTK integration excluded.`);
