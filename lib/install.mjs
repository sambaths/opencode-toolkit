import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parse, parseTree, findNodeAtLocation, visit, modify, applyEdits } from 'jsonc-parser';
import YAML from 'yaml';
import { DEFAULT_MODELS, ROLE_TIERS, BUILTIN_OVERRIDE_ROLES, assertModelSelector } from './model-profile.mjs';

const defaultBundle = fileURLToPath(new URL('../bundle/', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = file => readFileSync(file, 'utf8');

export const TOOLKIT_VERSION = '0.2.0';
export const DEFAULT_OPTIMIZATION_PROFILES = Object.freeze({ compaction: true, toolOutput: true, usageAudit: true });
export const DEFAULT_COMPACTION = Object.freeze({ auto: true, keep: Object.freeze({ tokens: 15000 }), buffer: '15%', background: false });
export const DEFAULT_TOOL_OUTPUT = Object.freeze({ max_lines: 2000, max_bytes: 51200 });
export const USAGE_AUDIT_FILES = Object.freeze([
  'commands/usage-audit.md', 'tools/usage-audit.mjs', 'tools/usage-audit.md', 'tools/usage-audit.test.mjs',
]);
const LEGACY_USAGE_AUDIT_FILE = 'command/usage-audit.md';
const DELETE = Symbol('delete');

export function parseConfig(content, name) {
  const errors = [];
  const result = parse(content, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !object(result)) throw new Error(`Invalid configuration: ${name}`);
  return result;
}

export function assertSafePath(root, file) {
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escapes installation root');
  let current = root;
  for (const segment of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`Refusing symlink: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function filesUnder(directory, relative = '') {
  return readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap(entry => {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Bundle contains symlink: ${name}`);
    if (entry.isDirectory()) return filesUnder(directory, name);
    if (!entry.isFile()) throw new Error(`Unsupported bundle entry: ${name}`);
    return [name];
  });
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${label}: expected a positive integer`);
}

function assertCompactionProfile(value, label = 'compaction profile') {
  if (!object(value)) throw new Error(`Invalid ${label}`);
  for (const key of Object.keys(value)) if (!['auto', 'keep', 'buffer', 'background'].includes(key)) throw new Error(`Invalid ${label} field: ${key}`);
  if (typeof value.auto !== 'boolean' || typeof value.background !== 'boolean') throw new Error(`Invalid ${label}: auto and background must be boolean`);
  if (!object(value.keep) || Object.keys(value.keep).some(key => key !== 'tokens')) throw new Error(`Invalid ${label} keep settings`);
  assertPositiveInteger(value.keep.tokens, `${label} keep.tokens`);
  if (typeof value.buffer !== 'string' || !/^(?:[1-9][0-9]?|100)%$/.test(value.buffer)) throw new Error(`Invalid ${label} buffer: expected a percentage`);
}

function assertToolOutputProfile(value, label = 'tool_output profile') {
  if (!object(value)) throw new Error(`Invalid ${label}: expected an object`);
  for (const key of Object.keys(value)) if (!['max_lines', 'max_bytes'].includes(key)) throw new Error(`Invalid ${label} field: ${key}`);
  assertPositiveInteger(value.max_lines, `${label} max_lines`);
  assertPositiveInteger(value.max_bytes, `${label} max_bytes`);
}

const PROFILE_KEYS = Object.keys(DEFAULT_OPTIMIZATION_PROFILES);
const SOURCE_VALUES = new Set(['generated', 'root-owned', 'user-managed', 'disabled']);
const LOCAL_SOURCE_VALUES = new Set(['generated', 'user-managed', 'disabled']);
const FORMAT2_ONLY_KEYS = new Set(['profiles', 'sources', 'provenance', 'generatedProfiles', 'createdParents']);
const MANIFEST_KEYS = new Set(['format', 'version', 'models', 'profiles', 'sources', 'provenance', 'generatedProfiles', 'createdParents',
  'files', 'config', 'inheritedPermissions', 'localPermissions', 'mergedPermissions']);

function exactKeys(value, keys, label) {
  if (!object(value)) throw new Error(`Invalid ${label}`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
}

function validateModels(value, { required = true } = {}) {
  if (value === undefined && !required) return;
  exactKeys(value, ['thinking', 'coding'], 'toolkit model profile');
  assertModelSelector(value.thinking, 'saved thinking model');
  assertModelSelector(value.coding, 'saved coding model');
}

function assertPermissionRule(rule, label) {
  if (!object(rule)) throw new Error(`Invalid ${label} rule`);
  exactKeys(rule, ['action', 'resource', 'effect'], `${label} rule`);
  if (typeof rule.action !== 'string' || typeof rule.resource !== 'string' || !['allow', 'ask', 'deny'].includes(rule.effect)) {
    throw new Error(`Invalid ${label} rule`);
  }
}

function assertSingularPermission(value, label) {
  if (value === undefined) return;
  if (!object(value) || Array.isArray(value)) throw new Error(`Invalid or mixed canonical/V1 ${label}`);
  try { assertPermissionRule(value, label); }
  catch { throw new Error(`Invalid or mixed canonical/V1 ${label}`); }
}

function validatePermissions(value, label) {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`);
  for (const rule of value) assertPermissionRule(rule, label);
}

function validateFiles(value) {
  if (!object(value)) throw new Error('Invalid toolkit managed files');
  for (const [relative, digest] of Object.entries(value)) {
    if (!relative || path.isAbsolute(relative) || path.normalize(relative) !== relative || relative.split(path.sep).includes('..') || !/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error('Invalid toolkit managed file record');
    }
  }
}

function validateCreatedParents(value) {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Invalid toolkit createdParents');
  const seen = new Set();
  for (const parent of value) {
    if (!Array.isArray(parent) || !parent.length || parent.length > 16 || parent.some(part => typeof part !== 'string' || !part || part.length > 256 || part.includes('\0'))) {
      throw new Error('Invalid toolkit createdParents path');
    }
    const key = JSON.stringify(parent);
    if (seen.has(key)) throw new Error('Duplicate toolkit createdParents path');
    seen.add(key);
  }
}

export function validateManifest(value) {
  if (!object(value) || ![1, 2].includes(value.format)) throw new Error('Unsupported toolkit manifest format');
  for (const key of Object.keys(value)) if (!MANIFEST_KEYS.has(key)) throw new Error(`Unknown toolkit manifest field: ${key}`);
  if (value.format === 1) {
    for (const key of FORMAT2_ONLY_KEYS) if (Object.hasOwn(value, key)) throw new Error(`Format 1 manifest contains format-2-only field: ${key}`);
    if (value.version !== undefined && typeof value.version !== 'string') throw new Error('Invalid toolkit manifest version');
    validateModels(value.models, { required: false });
    if (value.files !== undefined) validateFiles(value.files);
    if (value.config !== undefined && !object(value.config)) throw new Error('Invalid toolkit bundle config snapshot');
    for (const key of ['inheritedPermissions', 'localPermissions', 'mergedPermissions']) {
      if (value[key] !== undefined) validatePermissions(value[key], key);
    }
    return value;
  }
  for (const key of MANIFEST_KEYS) if (!Object.hasOwn(value, key)) throw new Error(`Missing toolkit manifest field: ${key}`);
  if (value.version !== TOOLKIT_VERSION) throw new Error(`Unsupported toolkit manifest version: ${value.version}`);
  validateModels(value.models);
  exactKeys(value.profiles, PROFILE_KEYS, 'toolkit optimization profiles');
  for (const key of PROFILE_KEYS) if (typeof value.profiles[key] !== 'boolean') throw new Error(`Invalid toolkit optimization profile: ${key}`);
  exactKeys(value.sources, PROFILE_KEYS, 'toolkit optimization sources');
  for (const key of PROFILE_KEYS) if (!SOURCE_VALUES.has(value.sources[key])) throw new Error(`Invalid toolkit optimization source: ${key}`);
  exactKeys(value.provenance, PROFILE_KEYS, 'toolkit optimization provenance');
  for (const key of PROFILE_KEYS) {
    const allowed = key === 'usageAudit' ? new Set(['generated', 'disabled']) : LOCAL_SOURCE_VALUES;
    if (!allowed.has(value.provenance[key])) throw new Error(`Invalid toolkit optimization provenance: ${key}`);
    if (value.sources[key] === 'root-owned' ? !LOCAL_SOURCE_VALUES.has(value.provenance[key]) : value.provenance[key] !== value.sources[key]) {
      throw new Error(`Inconsistent ${key} provenance state`);
    }
  }
  exactKeys(value.generatedProfiles, ['compaction', 'toolOutput'], 'toolkit generated profiles');
  if (value.generatedProfiles.compaction !== null) assertCompactionProfile(value.generatedProfiles.compaction, 'generated compaction profile');
  if (value.generatedProfiles.toolOutput !== null) assertToolOutputProfile(value.generatedProfiles.toolOutput, 'generated tool_output profile');
  for (const [key, generated] of [['compaction', value.generatedProfiles.compaction], ['toolOutput', value.generatedProfiles.toolOutput]]) {
    const source = value.sources[key];
    if (source === 'generated' ? generated === null : generated !== null) throw new Error(`Inconsistent ${key} ownership state`);
    if (source === 'disabled' && value.profiles[key]) throw new Error(`Disabled ${key} source cannot be enabled`);
    if (source === 'generated' && !value.profiles[key]) throw new Error(`Generated ${key} source cannot be disabled`);
  }
  if (value.profiles.usageAudit ? value.sources.usageAudit !== 'generated' : value.sources.usageAudit !== 'disabled') {
    throw new Error('Inconsistent usage audit ownership state');
  }
  validateFiles(value.files);
  if (!value.profiles.usageAudit && USAGE_AUDIT_FILES.some(file => Object.hasOwn(value.files, file))) throw new Error('Disabled usage audit retains managed file hashes');
  if (value.profiles.usageAudit && USAGE_AUDIT_FILES.some(file => !Object.hasOwn(value.files, file))) throw new Error('Enabled usage audit is missing managed file hashes');
  validateCreatedParents(value.createdParents);
  if (!object(value.config)) throw new Error('Invalid toolkit bundle config snapshot');
  for (const key of ['inheritedPermissions', 'localPermissions', 'mergedPermissions']) validatePermissions(value[key], key);
  return value;
}

function resolveProfiles(previous, options) {
  if (previous.format !== undefined && previous.format !== 1 && previous.format !== 2) throw new Error('Unsupported toolkit manifest format');
  const profiles = { ...DEFAULT_OPTIMIZATION_PROFILES };
  if (previous.format === 2) {
    for (const key of PROFILE_KEYS) profiles[key] = previous.profiles[key];
  }
  for (const key of PROFILE_KEYS) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new Error(`Invalid ${key} option`);
  }
  if (options.noOptimizations !== undefined && typeof options.noOptimizations !== 'boolean') throw new Error('Invalid noOptimizations option');
  if (options.noOptimizations) for (const key of PROFILE_KEYS) profiles[key] = false;
  // The master switch establishes the baseline; explicit paired flags then
  // select the requested exceptions, independent of argument order.
  for (const key of PROFILE_KEYS) if (options[key] !== undefined) profiles[key] = options[key];
  return profiles;
}

function emptyGeneratedProfiles() {
  return { compaction: null, toolOutput: null };
}

function generatedProfiles(previous) {
  return previous.format === 2 ? structuredClone(previous.generatedProfiles) : emptyGeneratedProfiles();
}

function objectPaths(value, parent = []) {
  if (!object(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const location = [...parent, key];
    return object(child) ? [location, ...objectPaths(child, location)] : [];
  });
}

function valueAt(value, location) {
  let current = value;
  for (const key of location) {
    if (!object(current) || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

function computeCreatedParents(previous, existing, merged) {
  const prior = previous.format === 2 ? previous.createdParents : [];
  const existingPaths = new Set(objectPaths(existing).map(location => JSON.stringify(location)));
  const mergedPaths = objectPaths(merged);
  const result = prior.filter(location => valueAt(merged, location) !== undefined);
  for (const location of mergedPaths) {
    if (!existingPaths.has(JSON.stringify(location))) result.push(location);
  }
  return [...new Map(result.map(location => [JSON.stringify(location), location])).values()]
    .sort((left, right) => left.length - right.length || JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function objectHasComments(content, location) {
  const errors = [];
  const tree = parseTree(content, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !tree) return false;
  const node = findNodeAtLocation(tree, location);
  if (!node) return false;
  let commented = false;
  visit(content, { onComment: offset => {
    if (offset >= node.offset && offset < node.offset + node.length) commented = true;
  } }, { allowTrailingComma: true, disallowComments: false });
  return commented;
}

function pruneCreatedEmptyParents(content, locations) {
  let result = content;
  const options = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } };
  for (const location of [...locations].sort((left, right) => right.length - left.length)) {
    const errors = [];
    const tree = parseTree(result, errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length || !tree) throw new Error('Invalid generated JSONC configuration');
    const node = findNodeAtLocation(tree, location);
    if (!node || node.type !== 'object') continue;
    const parsed = parse(result, errors, { allowTrailingComma: true, disallowComments: false });
    const value = valueAt(parsed, location);
    if (errors.length || !object(value) || Object.keys(value).length) continue;
    let commented = false;
    visit(result, { onComment: offset => {
      if (offset >= node.offset && offset < node.offset + node.length) commented = true;
    } }, { allowTrailingComma: true, disallowComments: false });
    if (!commented) result = applyEdits(result, modify(result, location, undefined, options));
  }
  return result;
}

function rootConflictState(direct, directPath) {
  return {
    file: directPath ? path.basename(directPath) : null,
    compaction: direct.compaction !== undefined,
    toolOutput: direct.tool_output !== undefined,
  };
}

function createOptimizationPlan(existing, incoming, previous, { profiles, requestedProfiles = {}, rootConflicts = {}, configText = '' } = {}) {
  profiles ??= resolveProfiles(previous, {});
  const defaults = {
    compaction: incoming.compaction ?? DEFAULT_COMPACTION,
    toolOutput: incoming.tool_output ?? DEFAULT_TOOL_OUTPUT,
  };
  assertCompactionProfile(defaults.compaction, 'bundle compaction profile');
  assertToolOutputProfile(defaults.toolOutput, 'bundle tool_output profile');
  const generated = generatedProfiles(previous);
  const previousSources = previous.format === 2 ? previous.sources : null;
  const previousProvenance = previous.format === 2 ? previous.provenance : null;
  const values = {};
  const notices = [];
  const conflicts = [];
  const sources = {};
  const provenance = {};

  for (const [key, configKey, conflictKey] of [
    ['compaction', 'compaction', 'compaction'],
    ['toolOutput', 'tool_output', 'toolOutput'],
  ]) {
    const current = existing[configKey];
    if (current !== undefined && !object(current)) throw new Error(`Invalid ${configKey} configuration`);
    const prior = generated[key];
    const priorSource = previousSources?.[key];
    const priorProvenance = previousProvenance?.[key];
    const rootOwned = rootConflicts[conflictKey];
    const matchesPrior = prior !== null && current !== undefined && isDeepStrictEqual(current, prior);
    const deleteCurrent = () => objectHasComments(configText, [configKey]) ? {} : DELETE;

    if (rootOwned) {
      const localPrecedence = current !== undefined && !matchesPrior && Object.keys(current).length > 0;
      if (matchesPrior) {
        values[configKey] = deleteCurrent();
        notices.push(`Removed toolkit-generated local ${configKey}; ${rootConflicts.file} root config controls the effective value.`);
      } else if (current !== undefined) {
        values[configKey] = current;
        notices.push(localPrecedence
          ? `Preserved local .opencode ${configKey}; it retains precedence over ${rootConflicts.file}.`
          : `Preserved empty local .opencode ${configKey}; ${rootConflicts.file} root config controls the effective value.`);
      } else values[configKey] = current;
      generated[key] = null;
      sources[key] = 'root-owned';
      const retainedEmptyParent = previous.createdParents?.some(parent => parent.length === 1 && parent[0] === configKey);
      provenance[key] = priorSource === 'root-owned'
        ? priorProvenance === 'user-managed' ? 'user-managed'
          : current !== undefined && Object.keys(current).length ? 'user-managed'
            : (current === undefined && retainedEmptyParent) || (current !== undefined && !Object.keys(current).length && !retainedEmptyParent) ? 'user-managed'
              : priorProvenance
        : current === undefined && priorSource === 'generated' ? 'user-managed'
          : current !== undefined && !matchesPrior && Object.keys(current).length ? 'user-managed'
            : priorSource ?? (profiles[key] ? 'generated' : 'disabled');
      const message = localPrecedence
        ? `${rootConflicts.file}: root config defines ${configKey}; preserved local .opencode value retains precedence.`
        : `${rootConflicts.file}: root config defines ${configKey}; root config controls the effective value and local toolkit management is suppressed.`;
      conflicts.push(message); notices.push(message);
    } else if (!profiles[key]) {
      sources[key] = 'disabled';
      if (prior && current !== undefined && !matchesPrior) throw new Error(`Customized ${configKey} configuration requires manual review before opt-out`);
      if (matchesPrior) values[configKey] = deleteCurrent();
      else if (current !== undefined) {
        values[configKey] = current;
        notices.push(`Opt-out preserved user-managed ${configKey} configuration; no toolkit-generated value was removed.`);
        sources[key] = 'user-managed';
      } else sources[key] = 'disabled';
      generated[key] = null;
    } else if (matchesPrior) {
      values[configKey] = structuredClone(defaults[key]);
      generated[key] = structuredClone(defaults[key]);
      sources[key] = 'generated';
    } else if (current !== undefined && !Object.keys(current).length && profiles[key] &&
      (priorSource === 'disabled' || (priorSource === 'root-owned' && requestedProfiles[key] === true)) &&
      previous.createdParents?.some(parent => parent.length === 1 && parent[0] === configKey)) {
      values[configKey] = structuredClone(defaults[key]);
      generated[key] = structuredClone(defaults[key]);
      sources[key] = 'generated';
      notices.push(`Restored toolkit defaults in the retained commented ${configKey} parent.`);
    } else if (current !== undefined) {
      values[configKey] = current;
      generated[key] = null;
      sources[key] = 'user-managed';
      notices.push(`Preserved user-managed ${configKey} configuration; it differs from the last toolkit-generated snapshot.`);
    } else if (prior !== null) {
      generated[key] = null;
      sources[key] = 'user-managed';
      notices.push(`Preserved user removal of ${configKey}; the prior toolkit-generated value was not restored.`);
    } else if (priorSource === 'user-managed' || (priorSource === 'root-owned' && priorProvenance === 'user-managed')) {
      generated[key] = null;
      sources[key] = 'user-managed';
      notices.push(`Preserved user-managed absence of ${configKey}; toolkit defaults were not restored.`);
    } else {
      values[configKey] = structuredClone(defaults[key]);
      generated[key] = structuredClone(defaults[key]);
      sources[key] = 'generated';
    }
    if (!rootOwned) provenance[key] = sources[key];
  }

  return { profiles, values, generatedProfiles: generated, sources, provenance, notices, conflicts };
}

export function mergeConfig(existing, incoming, previous = {}, options = {}) {
  assertSingularPermission(existing.permission, 'permission');
  assertSingularPermission(incoming.permission, 'permission');
  const merged = structuredClone(existing);
  const optimization = options.optimizationPlan ?? createOptimizationPlan(existing, incoming, previous, {
    profiles: options.profiles,
    rootConflicts: options.rootConflicts,
  });
  for (const key of ['agents', 'experimental']) {
    if (existing[key] !== undefined && !object(existing[key])) throw new Error(`Invalid ${key} configuration`);
    merged[key] = { ...existing[key] };
    for (const [name, value] of Object.entries(incoming[key] ?? {})) {
      merged[key][name] = value;
    }
  }
  for (const [key, value] of Object.entries(optimization.values)) {
    if (value === DELETE) delete merged[key];
    else if (value !== undefined) merged[key] = structuredClone(value);
  }
  const permissions = existing.permissions ?? [];
  if (!Array.isArray(permissions)) throw new Error('Invalid permissions configuration');
  for (const rule of permissions) assertPermissionRule(rule, 'permission');
  // Keep existing order after the baseline, never weaken an exact matcher.
  // This is a static merge, not an evaluation of wildcard/runtime policy.
  const key = rule => JSON.stringify([rule.action, rule.resource]);
  const rank = { allow: 0, ask: 1, deny: 2 };
  const baseline = incoming.permissions ?? [];
  if (!Array.isArray(baseline)) throw new Error('Invalid permissions configuration');
  for (const rule of baseline) assertPermissionRule(rule, 'permission');
  const strongest = new Map();
  for (const rule of [...baseline, ...permissions]) {
    const old = strongest.get(key(rule));
    if (!old || rank[rule.effect] > rank[old]) strongest.set(key(rule), rule.effect);
  }
  const existingKeys = new Set(permissions.map(key));
  const restrictiveKeys = new Set(permissions.filter(rule => rule.effect !== 'allow').map(key));
  const baselineKeys = new Set(baseline.map(key));
  merged.permissions = [
    // Absorb matching allows in their baseline position, so a broad allow does
    // not move behind the baseline's specific approval rules on first install.
    ...baseline.filter(rule => !existingKeys.has(key(rule)) || !restrictiveKeys.has(key(rule))),
    ...permissions.filter(rule => rule.effect !== 'allow' || !baselineKeys.has(key(rule)))
      .map(rule => ({ ...rule, effect: strongest.get(key(rule)) })),
  ];
  const instructions = existing.instructions ?? [];
  if (!Array.isArray(instructions)) throw new Error('Invalid instructions configuration');
  merged.instructions = [...new Set([...instructions, ...incoming.instructions])];
  merged.$schema ??= incoming.$schema;
  merged.default_agent ??= incoming.default_agent;
  merged.websearch ??= incoming.websearch;
  return merged;
}

function clearObjectKeepingComments(content, location) {
  const errors = [];
  const tree = parseTree(content, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !tree) return content;
  const node = findNodeAtLocation(tree, location);
  if (!node || node.type !== 'object') return content;
  const comments = [];
  visit(content, { onComment: (offset, length) => {
    if (offset >= node.offset && offset < node.offset + node.length) comments.push(content.slice(offset, offset + length));
  } }, { allowTrailingComma: true, disallowComments: false });
  if (!comments.length) return content;
  const indentation = '  '.repeat(location.length);
  const replacement = `{\n${comments.map(comment => `${indentation}  ${comment}`).join('\n')}\n${indentation}}`;
  return applyEdits(content, [{ offset: node.offset, length: node.length, content: replacement }]);
}

function mergeObjectText(original, oldConfig, newConfig, parent, options) {
  let result = original;
  if (!Object.keys(newConfig).length) {
    const cleared = clearObjectKeepingComments(result, parent);
    if (cleared !== result) return cleared;
  }
  for (const key of new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)])) {
    const oldValue = oldConfig[key];
    const newValue = Object.hasOwn(newConfig, key) ? newConfig[key] : undefined;
    if (equal(oldValue, newValue)) continue;
    const location = [...parent, key];
    if (object(oldValue) && object(newValue)) {
      if (!Object.keys(newValue).length) {
        const cleared = clearObjectKeepingComments(result, location);
        if (cleared !== result) { result = cleared; continue; }
      }
      result = mergeObjectText(result, oldValue, newValue, location, options);
    } else result = applyEdits(result, modify(result, location, newValue, options));
  }
  return result;
}

function mergeText(original, oldConfig, newConfig, createdParents = []) {
  let result = original;
  const options = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } };
  for (const key of new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)])) {
    const value = Object.hasOwn(newConfig, key) ? newConfig[key] : undefined;
    if (equal(oldConfig[key], value)) continue;
    // Change individual map members (recursively) to retain unrelated JSONC comments.
    if (object(oldConfig[key]) && object(value)) result = mergeObjectText(result, oldConfig[key], value, [key], options);
    else result = applyEdits(result, modify(result, [key], value, options));
  }
  result = pruneCreatedEmptyParents(result, createdParents);
  return result.endsWith('\n') ? result : `${result}\n`;
}

function assertNoSymlinkComponents(directory) {
  const parsed = path.parse(directory);
  let current = parsed.root;
  for (const segment of directory.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = lstatIfExists(current);
    if (stat?.isSymbolicLink()) throw new Error(`Refusing symlinked installation path: ${current}`);
  }
}

function openAnchoredDirectory(directory) {
  const parsed = path.parse(directory);
  const aliasRoot = process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd';
  let fd = openSync(parsed.root, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
  let alias = path.join(aliasRoot, String(fd));
  try {
    for (const segment of directory.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      const nextPath = path.join(alias, segment);
      const expected = lstatSync(nextPath);
      if (expected.isSymbolicLink() || !expected.isDirectory()) throw new Error(`Refusing symlinked or non-directory installation path: ${directory}`);
      const nextFD = openSync(nextPath, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0));
      const opened = fstatSync(nextFD);
      closeSync(fd);
      fd = nextFD;
      alias = path.join(aliasRoot, String(fd));
      if (!opened.isDirectory() || opened.dev !== expected.dev || opened.ino !== expected.ino) throw new Error(`Installation directory identity changed: ${directory}`);
    }
    return { fd, alias, path: directory };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function sameIdentity(actual, expected) {
  return actual.dev === expected.dev && actual.ino === expected.ino;
}

function installationRelative(value) {
  if (typeof value !== 'string' || value.includes('\0') || path.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    throw new Error('Refusing absolute or invalid installation path');
  }
  if (value === '') return '';
  const segments = value.split(path.sep);
  if (path.normalize(value) !== value || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('Refusing traversal or non-canonical installation path');
  }
  return value;
}

function openRelativeDirectory(base, relative, { create = false, mode = 0o755 } = {}) {
  const portable = installationRelative(relative);
  const segments = portable.split(path.sep).filter(Boolean);
  let current = base;
  let owned = false;
  try {
    for (const segment of segments) {
      const nextPath = path.join(current.alias, segment);
      let expected = lstatIfExists(nextPath);
      if (!expected && create) {
        mkdirSync(nextPath, { mode });
        expected = lstatSync(nextPath);
      }
      if (!expected) {
        const error = new Error(`Missing installation directory: ${portable}`);
        error.code = 'ENOENT';
        throw error;
      }
      if (expected.isSymbolicLink() || !expected.isDirectory()) throw new Error(`Refusing symlinked or non-directory installation path: ${portable}`);
      const nextFD = openSync(nextPath, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0));
      const opened = fstatSync(nextFD);
      if (!opened.isDirectory() || !sameIdentity(opened, expected)) {
        closeSync(nextFD);
        throw new Error(`Installation directory identity changed: ${portable}`);
      }
      if (owned) closeSync(current.fd);
      current = { fd: nextFD, alias: path.join(process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd', String(nextFD)), path: path.join(current.path, segment) };
      owned = true;
    }
    if (!owned) {
      const fd = openSync(base.alias, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
      return { fd, alias: path.join(process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd', String(fd)), path: base.path };
    }
    return current;
  } catch (error) {
    if (owned) closeSync(current.fd);
    throw error;
  }
}

function assertAnchoredFileIdentity(stat, expected, label) {
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !sameIdentity(stat, expected)) {
    throw new Error(`Installation ${label} identity changed during promotion`);
  }
}

function unlinkAnchoredEntry(entry) {
  try { unlinkSync(entry); }
  catch (error) {
    // Cleanup must not mask the identity error that triggered it. A
    // substituted directory is left in place rather than recursively removed.
    if (error.code === 'ENOENT' || error.code === 'EISDIR' || error.code === 'EPERM') return;
    throw error;
  }
}

function writeRelativeAnchored(base, relative, content, { mode, directoryMode = 0o755, afterTempCreate } = {}) {
  const portable = installationRelative(relative);
  const absolute = path.join(base.path, portable);
  if (process.platform === 'win32') {
    writeFileAnchored(absolute, content, mode === undefined ? { afterTempCreate } : { mode, afterTempCreate });
    return;
  }
  const parent = path.dirname(portable);
  const directory = openRelativeDirectory(base, parent === '.' ? '' : parent, { create: true, mode: directoryMode });
  const temporaryName = `.${path.basename(portable)}.toolkit-${process.pid}-${randomUUID()}.tmp`;
  const temporary = path.join(directory.alias, temporaryName);
  const target = path.join(directory.alias, path.basename(portable));
  let fd;
  let temporaryStat;
  try {
    const current = lstatIfExists(target);
    if (current && (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1)) throw new Error('Refusing unsafe installation write target: expected a single-link regular file');
    fd = openSync(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), mode ?? (current ? current.mode & 0o777 : 0o644));
    temporaryStat = fstatSync(fd);
    if (!temporaryStat.isFile() || temporaryStat.nlink !== 1) throw new Error('Refusing unsafe installation temporary file');
    if (typeof afterTempCreate === 'function') afterTempCreate(absolute);
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    const staged = lstatIfExists(temporary);
    assertAnchoredFileIdentity(staged, temporaryStat, 'temporary file');
    const destinationBefore = lstatIfExists(target);
    if (current && !destinationBefore) throw new Error('Installation destination disappeared during promotion');
    if (!current && destinationBefore) {
      unlinkAnchoredEntry(target);
      throw new Error('Installation destination appeared during promotion');
    }
    if (destinationBefore) {
      try { assertAnchoredFileIdentity(destinationBefore, current, 'destination file'); }
      catch (error) { unlinkAnchoredEntry(target); throw error; }
    }
    renameSync(temporary, target);
    const promoted = lstatIfExists(target);
    try { assertAnchoredFileIdentity(promoted, temporaryStat, 'destination file'); }
    catch (error) {
      unlinkAnchoredEntry(target);
      throw error;
    }
    // A concurrent process can still replace the entry after this verification
    // and before a later path-based consumer opens it. Pure Node cannot make
    // this lstat-and-use window atomic; the held directory fd bounds cleanup.
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkAnchoredEntry(temporary); }
    finally { closeSync(directory.fd); }
  }
}

function unlinkRelativeAnchored(base, relative, { beforeUnlink } = {}) {
  const portable = installationRelative(relative);
  const absolute = path.join(base.path, portable);
  if (process.platform === 'win32') {
    unlinkAnchored(absolute, { beforeUnlink });
    return;
  }
  const parent = path.dirname(portable);
  const directory = openRelativeDirectory(base, parent === '.' ? '' : parent);
  try {
    if (typeof beforeUnlink === 'function') beforeUnlink(absolute);
    const target = path.join(directory.alias, path.basename(portable));
    const stat = lstatIfExists(target);
    if (!stat) return;
    if (stat.isDirectory()) throw new Error('Refusing directory unlink through anchored file cleanup');
    unlinkSync(target);
  } finally { closeSync(directory.fd); }
}

function readRelativeFile(base, relative) {
  const portable = installationRelative(relative);
  const absolute = path.join(base.path, portable);
  if (process.platform === 'win32') return readFileSync(absolute);
  const parent = path.dirname(portable);
  const directory = openRelativeDirectory(base, parent === '.' ? '' : parent);
  let fd;
  try {
    fd = openSync(path.join(directory.alias, path.basename(portable)), fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Refusing unsafe installation read target');
    return readFileSync(fd);
  } catch (error) {
    if (error.code === 'ELOOP') throw new Error('Refusing symlinked installation read target');
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
    closeSync(directory.fd);
  }
}

function ensureRelativeDirectory(base, relative, mode) {
  if (process.platform === 'win32') {
    mkdirSync(path.join(base.path, installationRelative(relative)), { recursive: true, mode });
    return;
  }
  const directory = openRelativeDirectory(base, relative, { create: true, mode });
  closeSync(directory.fd);
}

export function writeFileAnchored(file, content, { mode: requestedMode, afterTempCreate } = {}) {
  const absolute = path.resolve(file);
  const parent = path.dirname(absolute);
  assertNoSymlinkComponents(parent);
  if (!lstatIfExists(parent)) mkdirSync(parent, { recursive: true });
  if (process.platform === 'win32') {
    // Windows retains a path-based atomic-rename residual; lstat checks reject
    // links before the rename, which replaces rather than truncates the target.
    const temporary = `${absolute}.toolkit-${process.pid}-${randomUUID()}.tmp`;
    try {
      const current = existsSync(absolute) ? lstatSync(absolute) : null;
      if (current && (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1)) throw new Error('Refusing unsafe installation write target: expected a single-link regular file');
      writeFileSync(temporary, content, { flag: 'wx', mode: requestedMode ?? (current ? current.mode & 0o777 : 0o644) });
      if (typeof afterTempCreate === 'function') afterTempCreate(absolute);
      renameSync(temporary, absolute);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    return;
  }
  const directory = openAnchoredDirectory(parent);
  const temporaryName = `.${path.basename(absolute)}.toolkit-${process.pid}-${randomUUID()}.tmp`;
  const temporary = path.join(directory.alias, temporaryName);
  const target = path.join(directory.alias, path.basename(absolute));
  let fd;
  let temporaryStat;
  try {
    const current = lstatIfExists(target);
    if (current && (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1)) throw new Error('Refusing unsafe installation write target: expected a single-link regular file');
    fd = openSync(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), requestedMode ?? (current ? current.mode & 0o777 : 0o644));
    temporaryStat = fstatSync(fd);
    if (!temporaryStat.isFile() || temporaryStat.nlink !== 1) throw new Error('Refusing unsafe installation temporary file');
    if (typeof afterTempCreate === 'function') afterTempCreate(absolute);
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    const staged = lstatIfExists(temporary);
    assertAnchoredFileIdentity(staged, temporaryStat, 'temporary file');
    const destinationBefore = lstatIfExists(target);
    if (current && !destinationBefore) throw new Error('Installation destination disappeared during promotion');
    if (!current && destinationBefore) {
      unlinkAnchoredEntry(target);
      throw new Error('Installation destination appeared during promotion');
    }
    if (destinationBefore) {
      try { assertAnchoredFileIdentity(destinationBefore, current, 'destination file'); }
      catch (error) { unlinkAnchoredEntry(target); throw error; }
    }
    renameSync(temporary, target);
    const promoted = lstatIfExists(target);
    try { assertAnchoredFileIdentity(promoted, temporaryStat, 'destination file'); }
    catch (error) { unlinkAnchoredEntry(target); throw error; }
    // A concurrent process can still replace the entry after this verification
    // and before a later path-based consumer opens it. Pure Node cannot make
    // this lstat-and-use window atomic; the held directory fd bounds cleanup.
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkAnchoredEntry(temporary); }
    finally { closeSync(directory.fd); }
  }
}

export function renameAnchored(source, destination) {
  const from = path.resolve(source); const to = path.resolve(destination);
  if (process.platform === 'win32') { renameSync(from, to); return; }
  const sourceDirectory = openAnchoredDirectory(path.dirname(from));
  let destinationDirectory;
  try {
    destinationDirectory = openAnchoredDirectory(path.dirname(to));
    const sourcePath = path.join(sourceDirectory.alias, path.basename(from));
    const destinationPath = path.join(destinationDirectory.alias, path.basename(to));
    const expected = lstatSync(sourcePath);
    if (expected.isSymbolicLink()) throw new Error('Refusing symlinked installation rename source');
    renameSync(sourcePath, destinationPath);
    const promoted = lstatSync(destinationPath);
    if (promoted.dev !== expected.dev || promoted.ino !== expected.ino) throw new Error('Installation rename identity changed');
  } finally {
    closeSync(sourceDirectory.fd);
    if (destinationDirectory) closeSync(destinationDirectory.fd);
  }
}

export function unlinkAnchored(file, { beforeUnlink } = {}) {
  const absolute = path.resolve(file);
  if (process.platform === 'win32') {
    // Windows retains path-based unlink TOCTOU; the installer's prior lstat and
    // containment checks still reject links before this fallback.
    if (typeof beforeUnlink === 'function') beforeUnlink(absolute);
    try { unlinkSync(absolute); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return;
  }
  const directory = openAnchoredDirectory(path.dirname(absolute));
  try {
    if (typeof beforeUnlink === 'function') beforeUnlink(absolute);
    const target = path.join(directory.alias, path.basename(absolute));
    const stat = lstatIfExists(target);
    if (!stat) return;
    if (stat.isDirectory()) throw new Error('Refusing directory unlink through anchored file cleanup');
    unlinkSync(target);
  } finally { closeSync(directory.fd); }
}

function lstatIfExists(file) {
  try { return lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function removeDefinitions(settings, agentNames, commandNames) {
  const result = structuredClone(settings);
  for (const [key, names] of [['agents', agentNames], ['agent', agentNames], ['commands', commandNames], ['command', commandNames]]) {
    if (result[key] === undefined) continue;
    if (!object(result[key])) throw new Error(`Invalid ${key} configuration`);
    for (const name of names) delete result[key][name];
  }
  return result;
}

function checkAgentPermissions(definition, replacement, name) {
  if (definition?.permission !== undefined) {
    // A singular permission object is only valid as one exact V2 rule. A V1
    // action-to-effect map (for example { bash: 'allow' }) is a mixed migration.
    if (!object(definition.permission) || Array.isArray(definition.permission)) {
      throw new Error(`Invalid or mixed canonical/V1 agent permissions: ${name}`);
    }
    try { assertPermissionRule(definition.permission, `agent permissions (${name})`); }
    catch { throw new Error(`Invalid or mixed canonical/V1 agent permissions: ${name}`); }
    if (definition.permission.effect !== 'allow' &&
        !equal(definition.permission, replacement?.permission) &&
        !replacement?.permissions?.some(rule => equal(rule, definition.permission))) {
      throw new Error(`Restrictive agent permission migration requires manual review: ${name}`);
    }
  }
  if (definition?.permissions === undefined) return;
  if (!Array.isArray(definition.permissions)) throw new Error(`Review agent permissions: ${name}`);
  for (const rule of definition.permissions) {
    if (!object(rule) || !['allow', 'ask', 'deny'].includes(rule.effect)) {
      throw new Error(`Invalid or mixed canonical/V1 agent permissions: ${name}`);
    }
    try { assertPermissionRule(rule, `agent permissions (${name})`); }
    catch { throw new Error(`Invalid or mixed canonical/V1 agent permissions: ${name}`); }
    if (rule.effect !== 'allow' && !equal(definition.permissions, replacement?.permissions)) {
      throw new Error(`Restrictive agent permission migration requires manual review: ${name}`);
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

function markdownDefinition(content, label = 'Markdown frontmatter') {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!header) return {};
  try { return parseFrontmatter(header[1]); }
  catch (error) { throw new Error(`Invalid agent frontmatter at ${label}: ${error.message}`); }
}

function modelFor(name, models) {
  const tier = ROLE_TIERS[name];
  if (!tier) throw new Error(`Missing model tier for shipped agent: ${name}`);
  return models[tier];
}

// Bundle templates remain model-neutral. The installed Markdown gets a quoted
// selector so YAML does not treat a #variant as a comment.
function renderAgentMarkdown(content, model) {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!header) throw new Error('Agent Markdown requires frontmatter for model assignment');
  const lines = header[1].split(/\r?\n/);
  const index = lines.findIndex(line => /^model\s*:/.test(line));
  if (index === -1) lines.unshift(`model: '${model}'`);
  else lines[index] = `model: '${model}'`;
  return `---\n${lines.join('\n')}\n---\n${content.slice(header[0].length)}`;
}

function resolveModels(previous, thinkingModel, codingModel) {
  const saved = previous.models === undefined ? { ...DEFAULT_MODELS } : previous.models;
  if (!object(saved)) throw new Error('Invalid toolkit model profile');
  const models = {
    thinking: saved.thinking === undefined ? DEFAULT_MODELS.thinking : saved.thinking,
    coding: saved.coding === undefined ? DEFAULT_MODELS.coding : saved.coding,
  };
  assertModelSelector(models.thinking, 'saved thinking model');
  assertModelSelector(models.coding, 'saved coding model');
  if (thinkingModel !== undefined) models.thinking = assertModelSelector(thinkingModel, 'thinking model');
  if (codingModel !== undefined) models.coding = assertModelSelector(codingModel, 'coding model');
  return models;
}

function createInstallContext(project) {
  if (process.platform === 'win32') {
    // Windows retains the documented path-based fallback. POSIX holds both the
    // canonical project root and .opencode directory handles for the full call.
    return { project, posix: false, root: { path: project }, destination: null,
      close() {} };
  }
  let root = null;
  try {
    if (lstatIfExists(project)) root = openAnchoredDirectory(project);
    const destination = root && lstatIfExists(path.join(project, '.opencode'))
      ? openRelativeDirectory(root, '.opencode')
      : null;
    const context = { project, posix: true, root, destination };
    context.close = () => {
      if (context.destination) closeSync(context.destination.fd);
      if (context.root) closeSync(context.root.fd);
    };
    return context;
  } catch (error) {
    if (root) closeSync(root.fd);
    throw error;
  }
}

function ensureInstallRoot(context) {
  if (!context.posix) return context.root;
  if (!context.root) {
    mkdirSync(context.project, { recursive: true });
    context.root = openAnchoredDirectory(context.project);
  }
  return context.root;
}

function ensureInstallDestination(context) {
  if (!context.posix) {
    context.destination ??= { path: path.join(context.project, '.opencode') };
    return context.destination;
  }
  const root = ensureInstallRoot(context);
  if (!context.destination) context.destination = openRelativeDirectory(root, '.opencode', { create: true });
  return context.destination;
}

function installBaseForPath(context, file) {
  const relative = path.relative(context.project, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Path escapes installation root');
  if (relative === '.opencode' || relative.startsWith(`.opencode${path.sep}`)) {
    const destination = ensureInstallDestination(context);
    return { base: destination, relative: relative === '.opencode' ? '' : relative.slice('.opencode'.length + 1) };
  }
  return { base: ensureInstallRoot(context), relative };
}

function saveBackups(context, changes) {
  const replaced = [];
  for (const change of changes) {
    const { base, relative } = installBaseForPath(context, change.file);
    const projectRelative = path.relative(context.project, change.file);
    try { replaced.push({ ...change, base, relative, projectRelative, content: readRelativeFile(base, relative) }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!replaced.length) return null;
  const destination = ensureInstallDestination(context);
  const backupRelative = path.join('.toolkit-backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
  ensureRelativeDirectory(destination, '.toolkit-backups', 0o700);
  ensureRelativeDirectory(destination, backupRelative, 0o700);
  // Atomic replacement avoids truncating an external inode if a link appears
  // between validation and the write.
  writeRelativeAnchored(destination, path.join('.toolkit-backups', '.gitignore'), '*\n!.gitignore\n', { directoryMode: 0o700 });
  const files = [];
  for (const change of replaced) {
    const target = path.join(backupRelative, change.projectRelative);
    writeRelativeAnchored(destination, target, change.content, { mode: 0o600, directoryMode: 0o700 });
    files.push(change.projectRelative);
  }
  writeRelativeAnchored(destination, path.join(backupRelative, 'backup-manifest.json'), `${JSON.stringify({ files }, null, 2)}\n`, { mode: 0o600, directoryMode: 0o700 });
  return path.join(context.project, '.opencode', backupRelative);
}

export function install({ project = process.cwd(), dryRun = false, bundle = defaultBundle, thinkingModel, codingModel,
  compaction, toolOutput, usageAudit, noOptimizations, adoptUsageAudit = false } = {}) {
  project = path.resolve(project);
  const context = createInstallContext(project);
  try {
  const destination = path.join(project, '.opencode');
  assertSafePath(project, destination);
  const configPaths = ['opencode.json', 'opencode.jsonc'].map(f => path.join(destination, f));
  for (const file of configPaths) assertSafePath(project, file);
  if (configPaths.every(existsSync)) throw new Error('Ambiguous configuration: both opencode.json and opencode.jsonc exist');
  const configPath = configPaths.find(existsSync) ?? configPaths[0];
  const manifestPath = path.join(destination, 'toolkit-manifest.json');
  assertSafePath(project, manifestPath);
  const previous = existsSync(manifestPath) ? validateManifest(parseConfig(text(manifestPath), manifestPath)) : {};
  const profiles = resolveProfiles(previous, { compaction, toolOutput, usageAudit, noOptimizations });
  if (typeof adoptUsageAudit !== 'boolean') throw new Error('Invalid adoptUsageAudit option');
  if (profiles.usageAudit && !adoptUsageAudit) {
    for (const relative of [...USAGE_AUDIT_FILES, LEGACY_USAGE_AUDIT_FILE]) {
      const file = path.join(destination, relative);
      assertSafePath(project, file);
      if (existsSync(file) && !Object.hasOwn(previous.files ?? {}, relative)) {
        throw new Error(`Unmanaged usage audit collision requires explicit adoption: ${relative}`);
      }
      if (relative === LEGACY_USAGE_AUDIT_FILE && existsSync(file) && hash(readFileSync(file)) !== previous.files?.[relative]) {
        throw new Error(`Customized legacy usage audit command requires explicit adoption: ${relative}`);
      }
    }
  }
  const models = resolveModels(previous, thinkingModel, codingModel);
  const original = existsSync(configPath) ? text(configPath) : '{}\n';
  const existing = parseConfig(original, configPath);
  const incoming = parseConfig(text(path.join(bundle, 'opencode.json')), 'bundle/opencode.json');
  const directPaths = ['opencode.json', 'opencode.jsonc'].map(name => path.join(project, name));
  for (const file of directPaths) assertSafePath(project, file);
  if (directPaths.every(existsSync)) throw new Error('Ambiguous direct project configuration: both JSON and JSONC exist');
  const directPath = directPaths.find(existsSync);
  const direct = directPath ? parseConfig(text(directPath), directPath) : {};
  const customAgents = readdirSync(path.join(bundle, 'agents')).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
  const commandNames = readdirSync(path.join(bundle, 'commands')).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
  const managedCommandNames = commandNames.filter(name => name !== 'usage-audit' || profiles.usageAudit);
  const retainedAgents = Object.keys(incoming.agents ?? {});
  const renderedAgents = new Map(customAgents.map(name => [name, renderAgentMarkdown(
    text(path.join(bundle, 'agents', `${name}.md`)), modelFor(name, models),
  )]));
  const profiled = structuredClone(incoming);
  for (const name of retainedAgents) {
    if (!object(profiled.agents[name])) throw new Error(`Invalid agent configuration: ${name}`);
    profiled.agents[name] = { ...profiled.agents[name], model: modelFor(name, models) };
  }
  const agentNames = [...customAgents, ...retainedAgents];
  const replacements = Object.fromEntries(agentNames.map(name => [name,
    profiled.agents?.[name] ?? markdownDefinition(renderedAgents.get(name), `agents/${name}.md`)]));
  for (const settings of [existing, direct]) for (const key of ['agents', 'agent']) {
    for (const name of agentNames) if (settings[key]?.[name]) checkAgentPermissions(settings[key][name], replacements[name], name);
  }
  for (const [settings, label] of [[existing, 'permission'], [direct, 'direct permission']]) {
    if (settings.permission !== undefined) assertSingularPermission(settings.permission, label);
  }
  const local = removeDefinitions(existing, agentNames, managedCommandNames);
  const cleanedDirect = removeDefinitions(direct, agentNames, managedCommandNames);
  if (direct.permissions !== undefined) {
    if (!Array.isArray(direct.permissions)) throw new Error('Invalid direct permissions configuration');
    for (const rule of direct.permissions) assertPermissionRule(rule, 'direct permission');
    // Root policy stays intact; carry its ordered rules into the local merge.
    cleanedDirect.permissions = direct.permissions;
  }
  // Carry all ordered root rules after the toolkit baseline, before local rules.
  const inheritedPermissions = cleanedDirect.permissions ?? [];
  if (local.permissions !== undefined && !Array.isArray(local.permissions)) throw new Error('Invalid permissions configuration');
  const localPermissions = equal(local.permissions, previous.mergedPermissions)
    ? previous.localPermissions ?? local.permissions ?? []
    : local.permissions ?? [];
  local.permissions = [...inheritedPermissions, ...localPermissions];
  const optimizationPlan = createOptimizationPlan(local, incoming, previous, {
    profiles, requestedProfiles: { compaction: compaction === true, toolOutput: toolOutput === true },
    rootConflicts: rootConflictState(direct, directPath), configText: original,
  });
  const merged = mergeConfig(local, profiled, previous, { optimizationPlan });
  for (const key of ['default_agent', '$schema', 'websearch']) {
    if (existing[key] === undefined && direct[key] !== undefined) merged[key] = direct[key];
  }
  // Assign built-in plan/general/explore models without providing a system
  // prompt, so OpenCode keeps its built-in prompts and any local overrides.
  for (const name of BUILTIN_OVERRIDE_ROLES) {
    const current = merged.agents?.[name];
    if (current !== undefined && !object(current)) throw new Error(`Invalid agent configuration: ${name}`);
    merged.agents ??= {};
    merged.agents[name] = { ...(current ?? {}), model: modelFor(name, models) };
  }
  const changes = [];
  const optimizationNotices = [...optimizationPlan.notices];
  const legacyUsageFile = path.join(destination, LEGACY_USAGE_AUDIT_FILE);
  assertSafePath(project, legacyUsageFile);
  if (profiles.usageAudit) {
    if (existsSync(legacyUsageFile) && (adoptUsageAudit || Object.hasOwn(previous.files ?? {}, LEGACY_USAGE_AUDIT_FILE))) {
      changes.push({ file: legacyUsageFile, content: null });
    }
  } else {
    for (const relative of [...USAGE_AUDIT_FILES, LEGACY_USAGE_AUDIT_FILE]) {
      const file = path.join(destination, relative);
      assertSafePath(project, file);
      if (!existsSync(file)) continue;
      if (!Object.hasOwn(previous.files ?? {}, relative)) {
        optimizationNotices.push(`Opt-out preserved unmanaged ${relative}; no toolkit-generated file was removed.`);
      } else if (hash(readFileSync(file)) === previous.files[relative]) changes.push({ file, content: null });
      else optimizationNotices.push(`Opt-out preserved customized ${relative}; no toolkit-generated file was removed.`);
    }
  }
  // Remove only definitions that collide with exported IDs, after backing them up.
  for (const [directory, names] of [['agent', agentNames], ['command', managedCommandNames.filter(name => name !== 'usage-audit')], ['agents', retainedAgents]]) {
    for (const name of names) {
      const file = path.join(destination, directory, `${name}.md`);
      assertSafePath(project, file);
      if (existsSync(file) && directory !== 'command') checkAgentPermissions(markdownDefinition(text(file), path.relative(project, file)), replacements[name], name);
      if (existsSync(file)) { readFileSync(file); changes.push({ file, content: null }); }
    }
  }
  const hashes = {};
  const checkedSkills = new Set();
  for (const relative of filesUnder(bundle).filter(f => f !== 'opencode.json')) {
    if (USAGE_AUDIT_FILES.includes(relative) && !profiles.usageAudit) continue;
    const segments = relative.split(path.sep);
    if (segments[0] === 'skills' && segments.length > 2 && !checkedSkills.has(segments[1])) {
      const id = segments[1]; const directory = path.join(destination, 'skills', id);
      assertSafePath(project, directory);
      if (existsSync(directory) && !Object.hasOwn(previous.files ?? {}, path.join('skills', id, 'SKILL.md'))) {
        throw new Error(`Unmanaged skill collision requires manual review: ${id}`);
      }
      checkedSkills.add(id);
    }
    const target = path.join(destination, relative);
    assertSafePath(project, target);
    if (segments[0] === 'skills' && segments.length === 2 && existsSync(target) && !Object.hasOwn(previous.files ?? {}, relative)) {
      throw new Error(`Unmanaged skill metadata collision requires manual review: ${relative}`);
    }
    const name = segments.length === 2 && segments[0] === 'agents' && relative.endsWith('.md')
      ? path.basename(relative, '.md')
      : null;
    const content = name === null ? readFileSync(path.join(bundle, relative)) : renderedAgents.get(name);
    if (content === undefined) throw new Error(`Missing rendered agent content: ${relative}`);
    hashes[relative] = hash(content);
    if (existsSync(target)) {
      if (name !== null) checkAgentPermissions(markdownDefinition(text(target), path.relative(project, target)), replacements[name], name);
      const actual = hash(readFileSync(target));
      if (actual === hashes[relative]) continue;
    }
    changes.push({ file: target, content });
  }
  const candidateParents = computeCreatedParents(previous, existing, merged);
  const updated = mergeText(original, existing, merged, candidateParents);
  const finalConfig = parseConfig(updated, configPath);
  const createdParents = candidateParents.filter(location => object(valueAt(finalConfig, location)));
  if (updated !== original) changes.push({ file: configPath, content: updated });
  if (directPath && !equal(direct, cleanedDirect)) changes.push({ file: directPath, content: mergeText(text(directPath), direct, cleanedDirect) });
  const sources = { ...optimizationPlan.sources, usageAudit: profiles.usageAudit ? 'generated' : 'disabled' };
  const provenance = { ...optimizationPlan.provenance, usageAudit: profiles.usageAudit ? 'generated' : 'disabled' };
  const manifest = `${JSON.stringify({ format: 2, version: TOOLKIT_VERSION, models, profiles, sources, provenance,
    generatedProfiles: optimizationPlan.generatedProfiles, createdParents, files: hashes, config: incoming,
    inheritedPermissions, localPermissions, mergedPermissions: merged.permissions }, null, 2)}\n`;
  if (!existsSync(manifestPath) || text(manifestPath) !== manifest) changes.push({ file: manifestPath, content: manifest });
  assertSafePath(project, path.join(destination, '.toolkit-backups/.gitignore'));
  const backupDirectory = dryRun ? null : saveBackups(context, changes);
  if (!dryRun) {
    ensureInstallDestination(context);
    for (const change of changes) {
      const { base, relative } = installBaseForPath(context, change.file);
      if (change.content === null) unlinkRelativeAnchored(base, relative);
      else writeRelativeAnchored(base, relative, change.content);
    }
  }
  return { project, dryRun, models, profiles, sources, provenance, optimizationNotices, rootConflicts: optimizationPlan.conflicts,
    modelAvailability: 'unverified', changes: changes.map(change => path.relative(project, change.file)), configPath, backupDirectory,
    permissionReview: 'Existing restrictive permission order retained after baseline; matching allows absorbed at baseline position; exact matchers use the stricter effect. Review overlapping local exceptions: this is not effective runtime policy verification.' };
  } finally { context.close(); }
}
