import { randomUUID } from 'node:crypto';
import {
  closeSync, constants as fsConstants, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';

const DEFAULT_DIRECTORY_MODE = 0o755;
const DEFAULT_FILE_MODE = 0o644;
const NO_FOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const FD_ALIAS_CANDIDATES = ['/proc/self/fd', '/dev/fd'];

let probedAlias;

function lstatIfExists(file) {
  try { return lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
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

// Checks the path from stopAt (exclusive) to directory (inclusive). Callers
// choose stopAt so a user-selected ancestor such as a symlinked /tmp on macOS
// is trusted, while every component inside the managed tree is not.
function assertNoSymlinkComponents(directory, stopAt = path.parse(directory).root) {
  const relative = path.relative(stopAt, directory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escapes installation root');
  let current = stopAt;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = lstatIfExists(current);
    if (stat?.isSymbolicLink()) throw new Error(`Refusing symlinked installation path: ${current}`);
  }
}

function assertFileIdentity(stat, expected, label) {
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !sameIdentity(stat, expected)) {
    throw new Error(`Installation ${label} identity changed during promotion`);
  }
}

function unlinkEntry(entry) {
  try { unlinkSync(entry); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR' || error.code === 'EPERM') return;
    throw error;
  }
}

// Path-based cleanup cannot follow a moved parent. Locate the original
// directory by identity within its parent and remove the named temp there.
// This is best-effort: a directory moved outside its original parent cannot be
// reached without a directory fd.
function cleanupPortableTemporary(directory, name) {
  try {
    const current = lstatSync(directory.path);
    if (current.isDirectory() && !current.isSymbolicLink() && sameIdentity(current, directory.identity)) {
      unlinkEntry(path.join(directory.path, name));
      return;
    }
  } catch { /* fall through to the identity scan */ }
  try {
    const parent = path.dirname(directory.path);
    for (const entry of readdirSync(parent)) {
      if (entry === path.basename(directory.path)) continue;
      const candidate = path.join(parent, entry);
      let stat;
      try { stat = lstatSync(candidate); } catch { continue; }
      if (!stat.isDirectory() || stat.isSymbolicLink() || !sameIdentity(stat, directory.identity)) continue;
      unlinkEntry(path.join(candidate, name));
      return;
    }
  } catch { /* cleanup must not mask the identity failure */ }
}

function assertAliasTraverses(aliasRoot, fd) {
  const directory = path.join(aliasRoot, String(fd));
  let names;
  try { names = readdirSync(directory); } catch { return false; }
  let compared = 0;
  for (const name of names.slice(0, 16)) {
    if (name === '.' || name === '..') continue;
    let throughAlias;
    let direct;
    try {
      throughAlias = lstatSync(path.join(directory, name));
      direct = lstatSync(path.join('/', name));
    } catch { continue; }
    if (!sameIdentity(throughAlias, direct)) return false;
    compared++;
  }
  return compared > 0;
}

export function probeDirectoryFdAlias(candidates = FD_ALIAS_CANDIDATES) {
  const custom = candidates !== FD_ALIAS_CANDIDATES;
  if (!custom && probedAlias !== undefined) return probedAlias;
  let result = null;
  let fd;
  try {
    fd = openSync('/', fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
    for (const aliasRoot of Array.isArray(candidates) ? candidates : []) {
      if (typeof aliasRoot !== 'string') continue;
      if (assertAliasTraverses(aliasRoot, fd)) {
        result = { aliasRoot };
        break;
      }
    }
  } catch {
    // A failed probe only removes the anchored optimization; portable remains.
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore cleanup failure */ }
    }
  }
  if (!custom) probedAlias = result;
  return result;
}

function portableIdentity(stat) {
  return { dev: stat.dev, ino: stat.ino };
}

function portableChain(base) {
  return Array.isArray(base.chain) && base.chain.length ? base.chain : [{ path: base.path, identity: base.identity }];
}

function verifyPortableBase(base) {
  for (const entry of portableChain(base)) {
    const stat = lstatSync(entry.path);
    if (stat.isSymbolicLink() || !stat.isDirectory() || !sameIdentity(stat, entry.identity)) {
      throw new Error(`Installation directory identity changed during promotion: ${entry.path}`);
    }
  }
}

function portableBaseWithin(directory, stopAt, { includeStopAt = true } = {}) {
  const relative = path.relative(stopAt, directory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escapes installation root');
  const chain = [];
  let current = stopAt;
  if (includeStopAt) {
    const stat = lstatSync(stopAt);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Refusing symlinked or non-directory installation path: ${stopAt}`);
    chain.push({ path: stopAt, identity: portableIdentity(stat) });
  }
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = lstatIfExists(current);
    if (!stat) {
      const error = new Error(`Missing installation directory: ${relative}`);
      error.code = 'ENOENT';
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Refusing symlinked or non-directory installation path: ${current}`);
    chain.push({ path: current, identity: portableIdentity(stat) });
  }
  if (!chain.length) {
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Refusing symlinked or non-directory installation path: ${directory}`);
    chain.push({ path: directory, identity: portableIdentity(stat) });
  }
  const last = chain[chain.length - 1];
  return { path: directory, identity: last.identity, chain };
}

function openPortableRelative(base, relative, { create = false, mode = DEFAULT_DIRECTORY_MODE } = {}) {
  verifyPortableBase(base);
  const portable = installationRelative(relative);
  const segments = portable === '' ? [] : portable.split(path.sep).filter(Boolean);
  let current = base.path;
  const chain = [...portableChain(base)];
  for (const segment of segments) {
    const nextPath = path.join(current, segment);
    let stat = lstatIfExists(nextPath);
    if (!stat && create) {
      mkdirSync(nextPath, { mode });
      stat = lstatSync(nextPath);
    }
    if (!stat) {
      const error = new Error(`Missing installation directory: ${portable}`);
      error.code = 'ENOENT';
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Refusing symlinked or non-directory installation path: ${portable}`);
    const identity = portableIdentity(stat);
    chain.push({ path: nextPath, identity });
    current = nextPath;
  }
  const identity = chain[chain.length - 1].identity;
  return { path: current, identity, chain };
}

function portableWriteWithin(directory, name, content, { mode, afterTempCreate } = {}) {
  const target = path.join(directory.path, name);
  const temporaryName = `${name}.toolkit-${process.pid}-${randomUUID()}.tmp`;
  const temporary = path.join(directory.path, temporaryName);
  let fd;
  let temporaryStat;
  try {
    verifyPortableBase(directory);
    const current = lstatIfExists(target);
    if (current && (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1)) throw new Error('Refusing unsafe installation write target: expected a single-link regular file');
    fd = openSync(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | NO_FOLLOW,
      mode ?? (current ? current.mode & 0o777 : DEFAULT_FILE_MODE));
    temporaryStat = fstatSync(fd);
    if (!temporaryStat.isFile() || temporaryStat.nlink !== 1) throw new Error('Refusing unsafe installation temporary file');
    if (typeof afterTempCreate === 'function') afterTempCreate(target);
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    // Re-verify immediately before the rename. A path-based backend cannot
    // close the lstat-to-rename window, but this bounds it to one syscall.
    verifyPortableBase(directory);
    const staged = lstatIfExists(temporary);
    assertFileIdentity(staged, temporaryStat, 'temporary file');
    const destinationBefore = lstatIfExists(target);
    if (current && !destinationBefore) throw new Error('Installation destination disappeared during promotion');
    if (!current && destinationBefore) {
      unlinkEntry(target);
      throw new Error('Installation destination appeared during promotion');
    }
    if (destinationBefore) {
      try { assertFileIdentity(destinationBefore, current, 'destination file'); }
      catch (error) { unlinkEntry(target); throw error; }
    }
    renameSync(temporary, target);
    const promoted = lstatIfExists(target);
    try { assertFileIdentity(promoted, temporaryStat, 'destination file'); }
    catch (error) {
      unlinkEntry(target);
      throw error;
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
    cleanupPortableTemporary(directory, temporaryName);
  }
}

function portableReadRelative(base, relative) {
  const portable = installationRelative(relative);
  const parent = path.dirname(portable);
  const directory = openPortableRelative(base, parent === '.' ? '' : parent, {});
  return portableReadWithin(directory, path.basename(portable));
}

function portableReadWithin(directory, name) {
  verifyPortableBase(directory);
  const target = path.join(directory.path, name);
  const expected = lstatSync(target);
  if (!expected.isFile() || expected.isSymbolicLink()) throw new Error('Refusing unsafe installation read target');
  let fd;
  try {
    fd = openSync(target, fsConstants.O_RDONLY | NO_FOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || !sameIdentity(stat, expected)) throw new Error('Installation read target identity changed');
    return readFileSync(fd);
  } catch (error) {
    if (error.code === 'ELOOP') throw new Error('Refusing symlinked installation read target');
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function portableUnlinkWithin(directory, name, { beforeUnlink } = {}) {
  verifyPortableBase(directory);
  const target = path.join(directory.path, name);
  if (typeof beforeUnlink === 'function') beforeUnlink(target);
  verifyPortableBase(directory);
  const stat = lstatIfExists(target);
  if (!stat) return;
  if (stat.isDirectory()) throw new Error('Refusing directory unlink through anchored file cleanup');
  if (stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Refusing unsafe installation unlink target: expected a single-link regular file');
  unlinkSync(target);
}

function anchoredOpenDirectory(directory, aliasRoot) {
  const parsed = path.parse(directory);
  let fd = openSync(parsed.root, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
  let alias = path.join(aliasRoot, String(fd));
  try {
    for (const segment of directory.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      const nextPath = path.join(alias, segment);
      const expected = lstatSync(nextPath);
      if (expected.isSymbolicLink() || !expected.isDirectory()) throw new Error(`Refusing symlinked or non-directory installation path: ${directory}`);
      const nextFD = openSync(nextPath, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | NO_FOLLOW);
      const opened = fstatSync(nextFD);
      closeSync(fd);
      fd = nextFD;
      alias = path.join(aliasRoot, String(fd));
      if (!opened.isDirectory() || !sameIdentity(opened, expected)) throw new Error(`Installation directory identity changed: ${directory}`);
    }
    return { fd, alias, path: directory };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function anchoredOpenRelative(base, relative, { create = false, mode = DEFAULT_DIRECTORY_MODE } = {}, aliasRoot) {
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
      const nextFD = openSync(nextPath, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | NO_FOLLOW);
      const opened = fstatSync(nextFD);
      if (!opened.isDirectory() || !sameIdentity(opened, expected)) {
        closeSync(nextFD);
        throw new Error(`Installation directory identity changed: ${portable}`);
      }
      if (owned) closeSync(current.fd);
      current = { fd: nextFD, alias: path.join(aliasRoot, String(nextFD)), path: path.join(current.path, segment) };
      owned = true;
    }
    if (!owned) {
      const fd = openSync(base.alias, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
      return { fd, alias: path.join(aliasRoot, String(fd)), path: base.path };
    }
    return current;
  } catch (error) {
    if (owned) closeSync(current.fd);
    throw error;
  }
}

function anchoredWriteWithin(base, relative, content, { mode, directoryMode = DEFAULT_DIRECTORY_MODE, afterTempCreate } = {}, aliasRoot) {
  const portable = installationRelative(relative);
  const absolute = path.join(base.path, portable);
  const parent = path.dirname(portable);
  const directory = anchoredOpenRelative(base, parent === '.' ? '' : parent, { create: true, mode: directoryMode }, aliasRoot);
  const temporaryName = `.${path.basename(portable)}.toolkit-${process.pid}-${randomUUID()}.tmp`;
  const temporary = path.join(directory.alias, temporaryName);
  const target = path.join(directory.alias, path.basename(portable));
  let fd;
  let temporaryStat;
  try {
    const current = lstatIfExists(target);
    if (current && (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1)) throw new Error('Refusing unsafe installation write target: expected a single-link regular file');
    fd = openSync(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | NO_FOLLOW,
      mode ?? (current ? current.mode & 0o777 : DEFAULT_FILE_MODE));
    temporaryStat = fstatSync(fd);
    if (!temporaryStat.isFile() || temporaryStat.nlink !== 1) throw new Error('Refusing unsafe installation temporary file');
    if (typeof afterTempCreate === 'function') afterTempCreate(absolute);
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    const staged = lstatIfExists(temporary);
    assertFileIdentity(staged, temporaryStat, 'temporary file');
    const destinationBefore = lstatIfExists(target);
    if (current && !destinationBefore) throw new Error('Installation destination disappeared during promotion');
    if (!current && destinationBefore) {
      unlinkEntry(target);
      throw new Error('Installation destination appeared during promotion');
    }
    if (destinationBefore) {
      try { assertFileIdentity(destinationBefore, current, 'destination file'); }
      catch (error) { unlinkEntry(target); throw error; }
    }
    renameSync(temporary, target);
    const promoted = lstatIfExists(target);
    try { assertFileIdentity(promoted, temporaryStat, 'destination file'); }
    catch (error) {
      unlinkEntry(target);
      throw error;
    }
    // A concurrent process can still replace the entry after this verification
    // and before a later path-based consumer opens it. Pure Node cannot make
    // this lstat-and-use window atomic; the held directory fd bounds cleanup.
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkEntry(temporary); }
    finally { closeSync(directory.fd); }
  }
}

function anchoredReadWithin(base, relative, aliasRoot) {
  const portable = installationRelative(relative);
  const parent = path.dirname(portable);
  const directory = anchoredOpenRelative(base, parent === '.' ? '' : parent, {}, aliasRoot);
  let fd;
  try {
    fd = openSync(path.join(directory.alias, path.basename(portable)), fsConstants.O_RDONLY | NO_FOLLOW);
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

function anchoredUnlinkWithin(base, relative, { beforeUnlink } = {}, aliasRoot) {
  const portable = installationRelative(relative);
  const absolute = path.join(base.path, portable);
  const parent = path.dirname(portable);
  const directory = anchoredOpenRelative(base, parent === '.' ? '' : parent, {}, aliasRoot);
  try {
    if (typeof beforeUnlink === 'function') beforeUnlink(absolute);
    const target = path.join(directory.alias, path.basename(portable));
    const stat = lstatIfExists(target);
    if (!stat) return;
    if (stat.isDirectory()) throw new Error('Refusing directory unlink through anchored file cleanup');
    if (stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Refusing unsafe installation unlink target: expected a single-link regular file');
    unlinkSync(target);
  } finally { closeSync(directory.fd); }
}

function anchoredWriteFile(file, content, { mode: requestedMode, afterTempCreate, root } = {}, aliasRoot) {
  const absolute = path.resolve(file);
  const parent = path.dirname(absolute);
  assertNoSymlinkComponents(parent, root ?? path.parse(parent).root);
  if (!lstatIfExists(parent)) mkdirSync(parent, { recursive: true });
  const directory = anchoredOpenDirectory(parent, aliasRoot);
  const temporaryName = `.${path.basename(absolute)}.toolkit-${process.pid}-${randomUUID()}.tmp`;
  const temporary = path.join(directory.alias, temporaryName);
  const target = path.join(directory.alias, path.basename(absolute));
  let fd;
  let temporaryStat;
  try {
    const current = lstatIfExists(target);
    if (current && (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1)) throw new Error('Refusing unsafe installation write target: expected a single-link regular file');
    fd = openSync(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | NO_FOLLOW,
      requestedMode ?? (current ? current.mode & 0o777 : DEFAULT_FILE_MODE));
    temporaryStat = fstatSync(fd);
    if (!temporaryStat.isFile() || temporaryStat.nlink !== 1) throw new Error('Refusing unsafe installation temporary file');
    if (typeof afterTempCreate === 'function') afterTempCreate(absolute);
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    const staged = lstatIfExists(temporary);
    assertFileIdentity(staged, temporaryStat, 'temporary file');
    const destinationBefore = lstatIfExists(target);
    if (current && !destinationBefore) throw new Error('Installation destination disappeared during promotion');
    if (!current && destinationBefore) {
      unlinkEntry(target);
      throw new Error('Installation destination appeared during promotion');
    }
    if (destinationBefore) {
      try { assertFileIdentity(destinationBefore, current, 'destination file'); }
      catch (error) { unlinkEntry(target); throw error; }
    }
    renameSync(temporary, target);
    const promoted = lstatIfExists(target);
    try { assertFileIdentity(promoted, temporaryStat, 'destination file'); }
    catch (error) {
      unlinkEntry(target);
      throw error;
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkEntry(temporary); }
    finally { closeSync(directory.fd); }
  }
}

function portableWriteFile(file, content, { mode: requestedMode, afterTempCreate, root } = {}) {
  const absolute = path.resolve(file);
  const parent = path.dirname(absolute);
  const stopAt = root ?? path.parse(parent).root;
  // Check the root and existing path before creating anything so a swapped
  // root or symlinked ancestor is never followed by mkdir.
  const stopStat = lstatSync(stopAt);
  if (stopStat.isSymbolicLink() || !stopStat.isDirectory()) throw new Error(`Refusing symlinked or non-directory installation path: ${stopAt}`);
  const stopIdentity = portableIdentity(stopStat);
  assertNoSymlinkComponents(parent, stopAt);
  if (!lstatIfExists(parent)) mkdirSync(parent, { recursive: true });
  const directory = portableBaseWithin(parent, stopAt);
  const recordedRoot = directory.chain[0];
  if (!recordedRoot || recordedRoot.path !== stopAt || !sameIdentity(recordedRoot.identity, stopIdentity)) {
    throw new Error(`Installation directory identity changed during promotion: ${stopAt}`);
  }
  portableWriteWithin(directory, path.basename(absolute), content, { mode: requestedMode, afterTempCreate });
}

function portableUnlinkFile(file, { beforeUnlink, root } = {}) {
  const absolute = path.resolve(file);
  const parent = path.dirname(absolute);
  const stopAt = root ?? path.parse(parent).root;
  const directory = portableBaseWithin(parent, stopAt);
  if (typeof beforeUnlink === 'function') beforeUnlink(absolute);
  portableUnlinkWithin(directory, path.basename(absolute));
}

function portableRename(from, to, { root } = {}) {
  const source = path.resolve(from);
  const destination = path.resolve(to);
  const sourceStopAt = root ?? path.parse(source).root;
  const destinationStopAt = root ?? path.parse(destination).root;
  const sourceParent = portableBaseWithin(path.dirname(source), sourceStopAt);
  const destinationParent = portableBaseWithin(path.dirname(destination), destinationStopAt);
  verifyPortableBase(sourceParent);
  verifyPortableBase(destinationParent);
  const expected = lstatSync(source);
  if (expected.isSymbolicLink()) throw new Error('Refusing symlinked installation rename source');
  verifyPortableBase(sourceParent);
  verifyPortableBase(destinationParent);
  renameSync(source, destination);
  const promoted = lstatSync(destination);
  if (!sameIdentity(promoted, expected)) throw new Error('Installation rename identity changed');
}

function anchoredRename(from, to, aliasRoot) {
  const source = path.resolve(from);
  const destination = path.resolve(to);
  const sourceDirectory = anchoredOpenDirectory(path.dirname(source), aliasRoot);
  let destinationDirectory;
  try {
    destinationDirectory = anchoredOpenDirectory(path.dirname(destination), aliasRoot);
    const sourcePath = path.join(sourceDirectory.alias, path.basename(source));
    const destinationPath = path.join(destinationDirectory.alias, path.basename(destination));
    const expected = lstatSync(sourcePath);
    if (expected.isSymbolicLink()) throw new Error('Refusing symlinked installation rename source');
    renameSync(sourcePath, destinationPath);
    const promoted = lstatSync(destinationPath);
    if (!sameIdentity(promoted, expected)) throw new Error('Installation rename identity changed');
  } finally {
    closeSync(sourceDirectory.fd);
    if (destinationDirectory) closeSync(destinationDirectory.fd);
  }
}

function anchoredUnlinkFile(file, { beforeUnlink } = {}, aliasRoot) {
  const absolute = path.resolve(file);
  const directory = anchoredOpenDirectory(path.dirname(absolute), aliasRoot);
  try {
    if (typeof beforeUnlink === 'function') beforeUnlink(absolute);
    const target = path.join(directory.alias, path.basename(absolute));
    const stat = lstatIfExists(target);
    if (!stat) return;
    if (stat.isDirectory()) throw new Error('Refusing directory unlink through anchored file cleanup');
    if (stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Refusing unsafe installation unlink target: expected a single-link regular file');
    unlinkSync(target);
  } finally { closeSync(directory.fd); }
}

function createPortableContext(project) {
  const context = { project, mode: 'portable', root: null, destination: null, close() {} };
  if (lstatIfExists(project)) {
    assertNoSymlinkComponents(project, path.dirname(project));
    context.root = portableBaseWithin(project, path.dirname(project), { includeStopAt: false });
  }
  if (context.root && lstatIfExists(path.join(project, '.opencode'))) {
    context.destination = portableBaseWithin(path.join(project, '.opencode'), project);
  }
  context.ensureRoot = () => {
    if (!context.root) {
      mkdirSync(project, { recursive: true, mode: DEFAULT_DIRECTORY_MODE });
      context.root = portableBaseWithin(project, path.dirname(project), { includeStopAt: false });
    }
    return context.root;
  };
  context.ensureDestination = () => {
    const root = context.ensureRoot();
    if (!context.destination) {
      context.destination = openPortableRelative(root, '.opencode', { create: true, mode: DEFAULT_DIRECTORY_MODE });
    }
    return context.destination;
  };
  return context;
}

function createAnchoredContext(project, aliasRoot) {
  let root = null;
  try {
    if (lstatIfExists(project)) root = anchoredOpenDirectory(project, aliasRoot);
    const destination = root && lstatIfExists(path.join(project, '.opencode'))
      ? anchoredOpenRelative(root, '.opencode', {}, aliasRoot)
      : null;
    const context = { project, mode: 'anchored', root, destination };
    context.ensureRoot = () => {
      if (!context.root) {
        mkdirSync(project, { recursive: true, mode: DEFAULT_DIRECTORY_MODE });
        context.root = anchoredOpenDirectory(project, aliasRoot);
      }
      return context.root;
    };
    context.ensureDestination = () => {
      const current = context.ensureRoot();
      if (!context.destination) {
        context.destination = anchoredOpenRelative(current, '.opencode', { create: true, mode: DEFAULT_DIRECTORY_MODE }, aliasRoot);
      }
      return context.destination;
    };
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

export function createManagedFs(mode = 'auto') {
  if (!['auto', 'portable', 'anchored'].includes(mode)) throw new Error(`Unknown managed filesystem mode: ${mode}`);
  const probe = mode === 'portable' ? null : probeDirectoryFdAlias();
  if (mode === 'anchored' && !probe) throw new Error('Anchored managed filesystem mode requires a traversable directory fd alias');
  const resolved = mode === 'portable' ? 'portable' : mode === 'anchored' ? 'anchored' : probe ? 'anchored' : 'portable';
  const aliasRoot = resolved === 'anchored' ? probe.aliasRoot : null;

  return {
    mode: resolved,
    createContext(project) {
      return resolved === 'anchored' ? createAnchoredContext(project, aliasRoot) : createPortableContext(project);
    },
    openRelative(base, relative, options = {}) {
      return resolved === 'anchored' ? anchoredOpenRelative(base, relative, options, aliasRoot) : openPortableRelative(base, relative, options);
    },
    readRelative(base, relative) {
      return resolved === 'anchored' ? anchoredReadWithin(base, relative, aliasRoot) : portableReadRelative(base, relative);
    },
    writeRelative(base, relative, content, options = {}) {
      return resolved === 'anchored'
        ? anchoredWriteWithin(base, relative, content, options, aliasRoot)
        : (() => {
          const portable = installationRelative(relative);
          const parent = path.dirname(portable);
          return portableWriteWithin(openPortableRelative(base, parent === '.' ? '' : parent, {
            create: true, mode: options.directoryMode ?? DEFAULT_DIRECTORY_MODE,
          }), path.basename(portable), content, options);
        })();
    },
    unlinkRelative(base, relative, options = {}) {
      return resolved === 'anchored'
        ? anchoredUnlinkWithin(base, relative, options, aliasRoot)
        : (() => {
          const portable = installationRelative(relative);
          const parent = path.dirname(portable);
          return portableUnlinkWithin(openPortableRelative(base, parent === '.' ? '' : parent, {}), path.basename(portable), options);
        })();
    },
    ensureRelativeDirectory(base, relative, mode = DEFAULT_DIRECTORY_MODE) {
      if (resolved === 'anchored') {
        const directory = anchoredOpenRelative(base, relative, { create: true, mode }, aliasRoot);
        closeSync(directory.fd);
        return;
      }
      openPortableRelative(base, relative, { create: true, mode });
    },
    writeFile(file, content, options = {}) {
      return resolved === 'anchored' ? anchoredWriteFile(file, content, options, aliasRoot) : portableWriteFile(file, content, options);
    },
    rename(from, to, options = {}) {
      return resolved === 'anchored' ? anchoredRename(from, to, aliasRoot) : portableRename(from, to, options);
    },
    unlink(file, options = {}) {
      return resolved === 'anchored' ? anchoredUnlinkFile(file, options, aliasRoot) : portableUnlinkFile(file, options);
    },
  };
}

export const defaultManagedFs = createManagedFs();
