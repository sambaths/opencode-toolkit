import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, modify, applyEdits } from 'jsonc-parser';

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
      const current = existing[key]?.[name];
      const old = previous[key]?.[name];
      if (current !== undefined && !equal(current, value) && !equal(current, old)) {
        throw new Error(`Configuration conflict: ${key}.${name}`);
      }
      merged[key][name] = value;
    }
  }
  const permissions = existing.permissions ?? [];
  if (!Array.isArray(permissions)) throw new Error('Invalid permissions configuration');
  merged.permissions = permissions.filter(current => !(previous.permissions ?? []).some(old => equal(old, current)));
  for (const rule of incoming.permissions ?? []) {
    for (const current of permissions) {
      if (!object(current)) throw new Error('Invalid permission rule');
      // Broad wildcard actions can also shadow the shared policy. Be conservative.
      const overlap = (current.action === rule.action || current.action === '*') &&
        (current.resource === rule.resource || current.resource === '*');
      if (overlap && current.effect !== rule.effect && !equal(current, rule)) {
        // A managed rule may legitimately differ from a more specific managed exception.
        if (![...(previous.permissions ?? []), ...(incoming.permissions ?? [])].some(known => equal(known, current))) {
          throw new Error(`Permission conflict: ${current.action}:${current.resource}; review policy before installing`);
        }
      }
    }
    if (!merged.permissions.some(current => equal(current, rule))) merged.permissions.push(rule);
  }
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
      for (const [name, item] of Object.entries(value)) {
        if (!equal(oldConfig[key][name], item)) result = applyEdits(result, modify(result, [key, name], item, options));
      }
    } else result = applyEdits(result, modify(result, [key], value, options));
  }
  return result.endsWith('\n') ? result : `${result}\n`;
}

function atomicWrite(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.toolkit-${process.pid}.tmp`;
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode: 0o644 });
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
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
  // Check the root configuration without copying provider settings or credentials.
  mergeConfig(direct, incoming);
  const merged = mergeConfig(existing, incoming, previous.config);
  for (const key of ['default_agent', '$schema', 'websearch']) {
    if (existing[key] === undefined && direct[key] !== undefined) merged[key] = direct[key];
  }
  // Refuse Markdown/JSON collisions and legacy command directory collisions.
  for (const directory of ['agents', 'commands']) {
    const names = readdirSync(path.join(bundle, directory)).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
    for (const name of names) {
      if ([existing, direct].some(settings => settings[directory]?.[name] || settings[directory === 'agents' ? 'agent' : 'command']?.[name])) {
        throw new Error(`Configuration conflict: ${directory}.${name} already defined in JSON`);
      }
      const legacy = path.join(destination, directory === 'agents' ? 'agent' : 'command', `${name}.md`);
      assertSafePath(project, legacy);
      if (existsSync(legacy)) throw new Error(`Legacy definition conflict: ${legacy}`);
    }
  }
  const changes = [];
  const hashes = {};
  for (const relative of filesUnder(bundle).filter(f => f !== 'opencode.json')) {
    const target = path.join(destination, relative);
    assertSafePath(project, target);
    const content = readFileSync(path.join(bundle, relative));
    hashes[relative] = hash(content);
    if (existsSync(target)) {
      const actual = hash(readFileSync(target));
      if (actual === hashes[relative]) continue;
      if (actual !== previous.files?.[relative]) throw new Error(`File conflict: ${target}; preserve your changes and resolve manually`);
    }
    changes.push({ file: target, content });
  }
  const updated = mergeText(original, existing, merged);
  if (updated !== original) changes.push({ file: configPath, content: updated });
  const manifest = `${JSON.stringify({ format: 1, version: '0.1.0', files: hashes, config: incoming }, null, 2)}\n`;
  if (!existsSync(manifestPath) || text(manifestPath) !== manifest) changes.push({ file: manifestPath, content: manifest });
  if (!dryRun) for (const change of changes) atomicWrite(change.file, change.content);
  return { project, dryRun, changes: changes.map(change => path.relative(project, change.file)), configPath };
}
