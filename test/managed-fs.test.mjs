import assert from 'node:assert/strict';
import {
  existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync,
  rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createManagedFs, defaultManagedFs, probeDirectoryFdAlias } from '../lib/managed-fs.mjs';
import { install } from '../lib/install.mjs';

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'opencode-managed-fs-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function relativeFiles(directory, prefix = '') {
  return readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
    const name = path.join(prefix, entry.name);
    if (entry.isDirectory()) return relativeFiles(directory, name);
    return [name];
  }).sort();
}

const probe = probeDirectoryFdAlias();

test('portable backend writes, preserves modes, reads, renames, and unlinks', t => {
  const project = fixture(t);
  const fs = createManagedFs('portable');
  const context = fs.createContext(project);
  const base = context.root;
  try {
    fs.writeRelative(base, 'nested/file.txt', 'first', { mode: 0o640 });
    const file = path.join(project, 'nested/file.txt');
    assert.equal(readFileSync(file, 'utf8'), 'first');
    assert.equal(statSync(file).mode & 0o777, 0o640);
    assert.deepEqual(fs.readRelative(base, 'nested/file.txt'), Buffer.from('first'));

    fs.writeRelative(base, 'nested/file.txt', 'second');
    assert.equal(readFileSync(file, 'utf8'), 'second');
    assert.equal(statSync(file).mode & 0o777, 0o640);

    fs.rename(file, path.join(project, 'nested/moved.txt'));
    assert.equal(readFileSync(path.join(project, 'nested/moved.txt'), 'utf8'), 'second');

    fs.unlinkRelative(base, 'nested/moved.txt');
    assert.equal(existsSync(path.join(project, 'nested/moved.txt')), false);

    fs.writeFile(path.join(project, 'absolute.txt'), 'absolute', { mode: 0o600 });
    assert.equal(readFileSync(path.join(project, 'absolute.txt'), 'utf8'), 'absolute');
    assert.equal(statSync(path.join(project, 'absolute.txt')).mode & 0o777, 0o600);
    fs.unlink(path.join(project, 'absolute.txt'));
    assert.equal(existsSync(path.join(project, 'absolute.txt')), false);
  } finally {
    context.close();
  }
});

test('portable backend refuses symlinked installation paths before writing', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t);
  const external = fixture(t);
  symlinkSync(external, path.join(project, 'linked'), 'dir');
  const fs = createManagedFs('portable');
  const context = fs.createContext(project);
  const base = context.root;
  try {
    assert.throws(() => fs.writeRelative(base, 'linked/file.txt', 'payload'), /symlink/i);
    assert.deepEqual(readdirSync(external), []);
  } finally {
    context.close();
  }

  const parent = fixture(t);
  const real = path.join(parent, 'real-project');
  const linked = path.join(parent, 'linked-project');
  mkdirSync(real);
  symlinkSync(real, linked, 'dir');
  assert.throws(() => createManagedFs('portable').createContext(linked), /symlink/i);
});

test('exported writeFile validates existing ancestors when no root is supplied', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t);
  const external = fixture(t);
  mkdirSync(path.join(external, 'sub'), { recursive: true });
  symlinkSync(external, path.join(project, 'linked'), 'dir');
  const fs = createManagedFs('portable');
  assert.throws(() => fs.writeFile(path.join(project, 'linked/sub/file.txt'), 'payload'), /symlink/i);
  assert.throws(() => fs.writeFile(path.join(project, 'linked/newdir/file.txt'), 'payload'), /symlink/i);
  assert.equal(existsSync(path.join(external, 'sub/file.txt')), false);
  assert.equal(existsSync(path.join(external, 'newdir')), false);
});

test('portable writeFile with root creates a missing authorized subdirectory after validation', t => {
  const project = fixture(t);
  const fs = createManagedFs('portable');
  const file = path.join(project, 'missing/nested/file.txt');
  fs.writeFile(file, 'created', { root: project });
  assert.equal(readFileSync(file, 'utf8'), 'created');
});

test('portable writeFile with root refuses a swapped project root', { skip: process.platform === 'win32' }, t => {
  const parent = fixture(t);
  const project = path.join(parent, 'project');
  mkdirSync(project);
  const held = path.join(parent, 'held-project');
  const external = fixture(t);
  mkdirSync(path.join(external, 'sub'), { recursive: true });
  renameSync(project, held);
  symlinkSync(external, project, 'dir');
  const fs = createManagedFs('portable');
  assert.throws(() => fs.writeFile(path.join(project, 'sub/file.txt'), 'payload', { root: project }), /symlink|identity|Refusing/i);
  assert.equal(existsSync(path.join(external, 'sub/file.txt')), false);
});

test('portable reads hard links but refuses them for write and unlink', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t);
  const external = fixture(t);
  const sentinel = path.join(external, 'sentinel.txt');
  writeFileSync(sentinel, 'EXTERNAL SENTINEL');
  linkSync(sentinel, path.join(project, 'hard.txt'));
  symlinkSync(sentinel, path.join(project, 'soft.txt'));
  const fs = createManagedFs('portable');
  const context = fs.createContext(project);
  const base = context.root;
  try {
    assert.deepEqual(fs.readRelative(base, 'hard.txt'), Buffer.from('EXTERNAL SENTINEL'));
    assert.throws(() => fs.writeRelative(base, 'hard.txt', 'overwrite'), /single-link|hard/i);
    assert.throws(() => fs.writeRelative(base, 'soft.txt', 'overwrite'), /unsafe|symlink/i);
    assert.throws(() => fs.unlinkRelative(base, 'hard.txt'), /single-link|unsafe|hard/i);
    assert.equal(readFileSync(sentinel, 'utf8'), 'EXTERNAL SENTINEL');
  } finally {
    context.close();
  }
});

test('portable context refuses a swapped .opencode base before read, write, unlink, or rename', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t);
  const held = path.join(project, 'held-opencode');
  const external = fixture(t);
  mkdirSync(path.join(project, '.opencode'));
  writeFileSync(path.join(project, '.opencode/keep.txt'), 'INTERNAL');
  writeFileSync(path.join(external, 'keep.txt'), 'EXTERNAL');
  const fs = createManagedFs('portable');
  const context = fs.createContext(project);
  try {
    assert.ok(context.destination, 'portable context should capture .opencode');
    renameSync(path.join(project, '.opencode'), held);
    symlinkSync(external, path.join(project, '.opencode'), 'dir');

    assert.throws(() => fs.writeRelative(context.destination, 'agents/manager.md', 'WRITTEN'), /identity|symlink/i);
    assert.throws(() => fs.readRelative(context.destination, 'keep.txt'), /identity|symlink/i);
    assert.throws(() => fs.unlinkRelative(context.destination, 'keep.txt'), /identity|symlink/i);
    assert.throws(() => fs.rename(path.join(project, '.opencode/keep.txt'), path.join(project, '.opencode/moved.txt')), /identity|symlink/i);

    assert.equal(existsSync(path.join(external, 'agents/manager.md')), false);
    assert.equal(existsSync(path.join(external, 'moved.txt')), false);
    assert.equal(readFileSync(path.join(external, 'keep.txt'), 'utf8'), 'EXTERNAL');
    assert.equal(readFileSync(path.join(held, 'keep.txt'), 'utf8'), 'INTERNAL');
  } finally {
    context.close();
  }
});

test('portable absolute unlink and rename with root refuse a swapped .opencode ancestor', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t);
  const held = path.join(project, 'held-opencode');
  const external = fixture(t);
  mkdirSync(path.join(project, '.opencode'));
  writeFileSync(path.join(project, '.opencode/managed.md'), 'INTERNAL');
  writeFileSync(path.join(external, 'managed.md'), 'EXTERNAL');
  const fs = createManagedFs('portable');
  const context = fs.createContext(project);
  try {
    renameSync(path.join(project, '.opencode'), held);
    symlinkSync(external, path.join(project, '.opencode'), 'dir');
    assert.throws(() => fs.unlink(path.join(project, '.opencode/managed.md'), { root: project }), /identity|symlink/i);
    assert.throws(() => fs.rename(path.join(project, '.opencode/managed.md'), path.join(project, '.opencode/moved.md'), { root: project }), /identity|symlink/i);
    assert.equal(readFileSync(path.join(external, 'managed.md'), 'utf8'), 'EXTERNAL');
    assert.equal(existsSync(path.join(external, 'moved.md')), false);
    assert.equal(readFileSync(path.join(held, 'managed.md'), 'utf8'), 'INTERNAL');
  } finally {
    context.close();
  }
});

test('portable write aborts when the parent is swapped after temp creation', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t);
  const directory = path.join(project, 'target');
  mkdirSync(directory);
  const held = path.join(project, 'held-target');
  const external = path.join(project, 'external-target');
  mkdirSync(external);
  const sentinel = path.join(external, 'file.txt');
  writeFileSync(sentinel, 'EXTERNAL SENTINEL');
  const fs = createManagedFs('portable');
  const root = fs.createContext(project);
  const base = fs.openRelative(root.root, 'target');
  try {
    assert.throws(() => fs.writeRelative(base, 'file.txt', 'new content', {
      afterTempCreate: () => {
        renameSync(directory, held);
        symlinkSync(external, directory, 'dir');
      },
    }), /identity|parent|symlink/i);
    assert.equal(readFileSync(sentinel, 'utf8'), 'EXTERNAL SENTINEL');
    assert.equal(existsSync(path.join(held, 'file.txt')), false);
    assert.equal(readdirSync(held).some(name => name.endsWith('.tmp')), false);
    assert.deepEqual(readdirSync(external), ['file.txt']);
  } finally {
    root.close();
  }
});

test('anchored backend keeps portable parity when the probe succeeds', { skip: !probe || process.platform === 'win32' }, t => {
  const project = fixture(t);
  const fs = createManagedFs('anchored');
  const context = fs.createContext(project);
  const base = context.root;
  try {
    fs.writeRelative(base, 'nested/file.txt', 'one', { mode: 0o640 });
    assert.equal(readFileSync(path.join(project, 'nested/file.txt'), 'utf8'), 'one');
    assert.equal(statSync(path.join(project, 'nested/file.txt')).mode & 0o777, 0o640);
    fs.writeRelative(base, 'nested/file.txt', 'two');
    assert.equal(statSync(path.join(project, 'nested/file.txt')).mode & 0o777, 0o640);
    fs.rename(path.join(project, 'nested/file.txt'), path.join(project, 'nested/moved.txt'));
    assert.equal(readFileSync(path.join(project, 'nested/moved.txt'), 'utf8'), 'two');
    fs.unlinkRelative(base, 'nested/moved.txt');
    assert.equal(existsSync(path.join(project, 'nested/moved.txt')), false);

    const from = path.join(project, 'directory-a');
    const to = path.join(project, 'directory-b');
    mkdirSync(from);
    writeFileSync(path.join(from, 'entry.txt'), 'directory entry');
    fs.rename(from, to);
    assert.equal(readFileSync(path.join(to, 'entry.txt'), 'utf8'), 'directory entry');
  } finally {
    context.close();
  }
});

test('probe-selected default backend performs anchored writes, reads, and unlinks', { skip: !probe || process.platform === 'win32' }, t => {
  const project = fixture(t);
  const context = defaultManagedFs.createContext(project);
  try {
    defaultManagedFs.writeRelative(context.root, 'probe.txt', 'anchored');
    assert.equal(readFileSync(path.join(project, 'probe.txt'), 'utf8'), 'anchored');
    assert.deepEqual(defaultManagedFs.readRelative(context.root, 'probe.txt'), Buffer.from('anchored'));

    const sentinel = path.join(project, 'hard-sentinel.txt');
    writeFileSync(sentinel, 'HARD LINK');
    linkSync(sentinel, path.join(project, 'hard-read.txt'));
    assert.deepEqual(defaultManagedFs.readRelative(context.root, 'hard-read.txt'), Buffer.from('HARD LINK'));

    defaultManagedFs.unlinkRelative(context.root, 'probe.txt');
    assert.equal(existsSync(path.join(project, 'probe.txt')), false);
    assert.throws(() => defaultManagedFs.unlinkRelative(context.root, 'hard-read.txt'), /single-link|unsafe|hard/i);
    assert.equal(readFileSync(sentinel, 'utf8'), 'HARD LINK');
    assert.equal(existsSync(path.join(project, 'hard-read.txt')), true);
  } finally {
    context.close();
  }
});

test('probe accepts a valid custom candidate on Linux', { skip: process.platform !== 'linux' || probe?.aliasRoot !== '/proc/self/fd' }, () => {
  assert.deepEqual(probeDirectoryFdAlias(['/proc/self/fd']), { aliasRoot: '/proc/self/fd' });
});

test('directory fd alias probe returns null for unusable candidate lists', () => {
  assert.equal(probeDirectoryFdAlias([]), null);
  assert.equal(probeDirectoryFdAlias(['/definitely/not/a/directory-fd-alias']), null);
});

test('portable install backs up and replaces a modified managed file', t => {
  const project = fixture(t);
  const backend = createManagedFs('portable');
  install({ project, fs: backend });
  const agent = path.join(project, '.opencode/agents/manager.md');
  writeFileSync(agent, 'customized manager');
  const result = install({ project, fs: backend });
  assert.ok(result.backupDirectory);
  assert.equal(readFileSync(path.join(result.backupDirectory, '.opencode/agents/manager.md'), 'utf8'), 'customized manager');
  assert.notEqual(readFileSync(agent, 'utf8'), 'customized manager');
});

test('portable install matches a default install tree and manifest hashes', t => {
  const anchoredProject = fixture(t);
  const portableProject = fixture(t);
  install({ project: anchoredProject });
  const portable = createManagedFs('portable');
  let writes = 0;
  const observed = {
    ...portable,
    writeRelative(...args) { writes++; return portable.writeRelative(...args); },
  };
  install({ project: portableProject, fs: observed });
  assert.equal(portable.mode, 'portable');
  assert.ok(writes > 0, 'install should route writes through the supplied backend');

  const expected = relativeFiles(path.join(anchoredProject, '.opencode'));
  const actual = relativeFiles(path.join(portableProject, '.opencode'));
  assert.deepEqual(actual, expected);
  for (const relative of expected) {
    assert.deepEqual(
      readFileSync(path.join(portableProject, '.opencode', relative)),
      readFileSync(path.join(anchoredProject, '.opencode', relative)),
      relative,
    );
  }
  const expectedManifest = JSON.parse(readFileSync(path.join(anchoredProject, '.opencode/toolkit-manifest.json'), 'utf8'));
  const actualManifest = JSON.parse(readFileSync(path.join(portableProject, '.opencode/toolkit-manifest.json'), 'utf8'));
  assert.deepEqual(actualManifest.files, expectedManifest.files);
  assert.deepEqual(actualManifest, expectedManifest);
});

test('portable install refuses a symlinked .opencode before any external write', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t);
  const external = fixture(t);
  symlinkSync(external, path.join(project, '.opencode'), 'dir');
  assert.throws(() => install({ project, fs: createManagedFs('portable') }), /symlink|Refusing/i);
  assert.deepEqual(readdirSync(external), []);
});

test('portable backend does not read through a symlinked target', { skip: process.platform === 'win32' }, t => {
  const project = fixture(t);
  const external = fixture(t);
  writeFileSync(path.join(external, 'secret.txt'), 'EXTERNAL');
  symlinkSync(path.join(external, 'secret.txt'), path.join(project, 'linked.txt'));
  const fs = createManagedFs('portable');
  const context = fs.createContext(project);
  const base = context.root;
  try {
    assert.throws(() => fs.readRelative(base, 'linked.txt'), /symlink|unsafe/i);
    assert.equal(lstatSync(path.join(project, 'linked.txt')).isSymbolicLink(), true);
  } finally {
    context.close();
  }
});
