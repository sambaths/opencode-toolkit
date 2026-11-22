import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, modify, applyEdits } from 'jsonc-parser';
import YAML from 'yaml';

const defaultBundle = fileURLToPath(new URL('../bundle/', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = file => readFileSync(file, 'utf8');

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

export function mergeConfig(existing, incoming, previous = {}) {
  const merged = structuredClone(existing);
  for (const key of ['agents', 'experimental']) {
    if (existing[key] !== undefined && !object(existing[key])) throw new Error(`Invalid ${key} configuration`);
    merged[key] = { ...existing[key] };
    for (const [name, value] of Object.entries(incoming[key] ?? {})) {
      merged[key][name] = value;
    }
  }
  const permissions = existing.permissions ?? [];
  if (!Array.isArray(permissions)) throw new Error('Invalid permissions configuration');
  for (const rule of permissions) {
    if (!object(rule) || typeof rule.action !== 'string' || typeof rule.resource !== 'string' || !['allow', 'ask', 'deny'].includes(rule.effect)) throw new Error('Invalid permission rule');
  }
  // Keep existing order after the baseline, never weaken an exact matcher.
  // This is a static merge, not an evaluation of wildcard/runtime policy.
  const key = rule => JSON.stringify([rule.action, rule.resource]);
  const rank = { allow: 0, ask: 1, deny: 2 };
  const baseline = incoming.permissions ?? [];
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

function mergeText(original, oldConfig, newConfig) {
  let result = original;
  const options = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } };
  for (const [key, value] of Object.entries(newConfig)) {
    if (equal(oldConfig[key], value)) continue;
    // Change individual map members to retain unrelated nested JSONC comments.
    if (object(oldConfig[key]) && object(value)) {
      for (const name of new Set([...Object.keys(oldConfig[key]), ...Object.keys(value)])) {
        if (!equal(oldConfig[key][name], value[name])) result = applyEdits(result, modify(result, [key, name], value[name], options));
      }
    } else result = applyEdits(result, modify(result, [key], value, options));
  }
  return result.endsWith('\n') ? result : `${result}\n`;
}

function atomicWrite(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.toolkit-${process.pid}.tmp`;
  try {
    const mode = existsSync(file) ? lstatSync(file).mode & 0o777 : 0o644;
    writeFileSync(temporary, content, { flag: 'wx', mode });
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
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
  if (definition?.permission !== undefined) throw new Error(`Review legacy agent permission migration: ${name}`);
  if (definition?.permissions === undefined) return;
  if (!Array.isArray(definition.permissions)) throw new Error(`Review agent permissions: ${name}`);
  for (const rule of definition.permissions) {
    if (!object(rule) || !['allow', 'ask', 'deny'].includes(rule.effect) || typeof rule.action !== 'string' || typeof rule.resource !== 'string') throw new Error(`Invalid agent permissions: ${name}`);
    if (rule.effect !== 'allow' && !equal(definition.permissions, replacement?.permissions)) {
      throw new Error(`Restrictive agent permission migration requires manual review: ${name}`);
    }
  }
}

function markdownDefinition(content) {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!header) return {};
  return YAML.parse(header[1], { uniqueKeys: true });
}

function saveBackups(project, changes) {
  const replaced = changes.filter(change => existsSync(change.file));
  if (!replaced.length) return null;
  const base = path.join(project, '.opencode/.toolkit-backups');
  const directory = path.join(base, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
  assertSafePath(project, path.join(base, '.gitignore'));
  mkdirSync(base, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(base, '.gitignore'), '*\n!.gitignore\n', { mode: 0o600 });
  mkdirSync(directory, { mode: 0o700 });
  const files = [];
  for (const change of replaced) {
    const relative = path.relative(project, change.file);
    const target = path.join(directory, relative);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, readFileSync(change.file), { flag: 'wx', mode: 0o600 });
    files.push(relative);
  }
  writeFileSync(path.join(directory, 'backup-manifest.json'), `${JSON.stringify({ files }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return directory;
}

export function install({ project = process.cwd(), dryRun = false, bundle = defaultBundle } = {}) {
  project = path.resolve(project);
  const destination = path.join(project, '.opencode');
  assertSafePath(project, destination);
  const configPaths = ['opencode.json', 'opencode.jsonc'].map(f => path.join(destination, f));
  for (const file of configPaths) assertSafePath(project, file);
  if (configPaths.every(existsSync)) throw new Error('Ambiguous configuration: both opencode.json and opencode.jsonc exist');
  const configPath = configPaths.find(existsSync) ?? configPaths[0];
  const manifestPath = path.join(destination, 'toolkit-manifest.json');
  assertSafePath(project, manifestPath);
  const previous = existsSync(manifestPath) ? parseConfig(text(manifestPath), manifestPath) : {};
  if (previous.format !== undefined && previous.format !== 1) throw new Error('Unsupported toolkit manifest format');
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
  const retainedAgents = Object.keys(incoming.agents ?? {});
  const agentNames = [...customAgents, ...retainedAgents];
  const replacements = Object.fromEntries(agentNames.map(name => [name, incoming.agents?.[name] ?? markdownDefinition(text(path.join(bundle, 'agents', `${name}.md`)))]));
  for (const settings of [existing, direct]) for (const key of ['agents', 'agent']) {
    for (const name of agentNames) if (settings[key]?.[name]) checkAgentPermissions(settings[key][name], replacements[name], name);
  }
  const local = removeDefinitions(existing, agentNames, commandNames);
  const cleanedDirect = removeDefinitions(direct, agentNames, commandNames);
  if (direct.permissions !== undefined) {
    if (!Array.isArray(direct.permissions)) throw new Error('Invalid direct permissions configuration');
    for (const rule of direct.permissions) {
      if (!object(rule) || typeof rule.action !== 'string' || typeof rule.resource !== 'string' || !['allow', 'ask', 'deny'].includes(rule.effect)) throw new Error('Invalid direct permission rule');
    }
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
  const merged = mergeConfig(local, incoming, previous.config);
  for (const key of ['default_agent', '$schema', 'websearch']) {
    if (existing[key] === undefined && direct[key] !== undefined) merged[key] = direct[key];
  }
  const changes = [];
  // Remove only definitions that collide with exported IDs, after backing them up.
  for (const [directory, names] of [['agent', agentNames], ['command', commandNames], ['agents', retainedAgents]]) {
    for (const name of names) {
      const file = path.join(destination, directory, `${name}.md`);
      assertSafePath(project, file);
      if (existsSync(file) && directory !== 'command') checkAgentPermissions(markdownDefinition(text(file)), replacements[name], name);
      if (existsSync(file)) { readFileSync(file); changes.push({ file, content: null }); }
    }
  }
  const hashes = {};
  const checkedSkills = new Set();
  for (const relative of filesUnder(bundle).filter(f => f !== 'opencode.json')) {
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
    const content = readFileSync(path.join(bundle, relative));
    hashes[relative] = hash(content);
    if (existsSync(target)) {
      if (path.dirname(relative) === 'agents' && relative.endsWith('.md')) {
        const name = path.basename(relative, '.md');
        checkAgentPermissions(markdownDefinition(text(target)), replacements[name], name);
      }
      const actual = hash(readFileSync(target));
      if (actual === hashes[relative]) continue;
    }
    changes.push({ file: target, content });
  }
  const updated = mergeText(original, existing, merged);
  if (updated !== original) changes.push({ file: configPath, content: updated });
  if (directPath && !equal(direct, cleanedDirect)) changes.push({ file: directPath, content: mergeText(text(directPath), direct, cleanedDirect) });
  const manifest = `${JSON.stringify({ format: 1, version: '0.1.0', files: hashes, config: incoming, inheritedPermissions, localPermissions, mergedPermissions: merged.permissions }, null, 2)}\n`;
  if (!existsSync(manifestPath) || text(manifestPath) !== manifest) changes.push({ file: manifestPath, content: manifest });
  assertSafePath(project, path.join(destination, '.toolkit-backups/.gitignore'));
  const backupDirectory = dryRun ? null : saveBackups(project, changes);
  if (!dryRun) for (const change of changes) {
    if (change.content === null) unlinkSync(change.file);
    else atomicWrite(change.file, change.content);
  }
  return { project, dryRun, changes: changes.map(change => path.relative(project, change.file)), configPath, backupDirectory,
    permissionReview: 'Existing restrictive permission order retained after baseline; matching allows absorbed at baseline position; exact matchers use the stricter effect. Review overlapping local exceptions: this is not effective runtime policy verification.' };
}
