import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { assertSafePath, install as installToolkit, renameAnchored, unlinkAnchored, writeFileAnchored } from './install.mjs';
import {
  RTK_COMMIT, RTK_EDITION, RTK_LICENSE, RTK_PRODUCT, RTK_RELEASE_PAGE, RTK_TAG, RTK_VERSION,
  resolveRtkTarget,
} from './rtk-catalog.mjs';
import { downloadRtkArchive } from './rtk-download.mjs';
import { extractRtkArchive, RTK_LICENSE_NAME, RTK_MAX_BINARY_BYTES, RTK_MAX_LICENSE_BYTES } from './rtk-archive.mjs';

export const RTK_METADATA_FILE = 'metadata.json';
export const RTK_METADATA_FORMAT = 1;
export const RTK_VENDOR_RELATIVE = '.opencode/vendor/rtk';
const RTK_MAX_METADATA_BYTES = 64 * 1024;
const RTK_BINARY_NAMES = new Set(['rtk', 'rtk.exe']);
const RTK_MANAGED_NAMES = new Set([...RTK_BINARY_NAMES, RTK_LICENSE_NAME, RTK_METADATA_FILE]);
const ADVICE = 'Use --no-rtk to install the toolkit without RTK.';

const hash = value => createHash('sha256').update(value).digest('hex');

function fail(message, cause, code = 'RTK_PROVISION_FAILED') {
  const text = typeof message === 'string' && message
    ? message
    : 'RTK provisioning failed';
  const error = new Error(text.includes('--no-rtk') ? text : `${text} ${ADVICE}`);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function wrap(error) {
  if (error?.message?.includes('--no-rtk') && typeof error.code === 'string' && error.code.startsWith('RTK_')) return error;
  return fail(error?.message || 'RTK provisioning failed', error);
}

function lstatMaybe(file) {
  try {
    return lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertRegularManagedFile(file, name) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink()) throw fail(`Refusing symlinked RTK management path: ${name}`);
  if (!stat.isFile()) throw fail(`Unmanaged RTK entry is not a regular file: ${name}`);
  if (stat.nlink > 1) throw fail(`Refusing hardlinked RTK management file: ${name}`);
  return stat;
}

function pathsFor(project) {
  const root = path.resolve(project);
  const destination = path.join(root, '.opencode');
  const vendor = path.join(destination, 'vendor');
  const managed = path.join(vendor, 'rtk');
  return { root, destination, vendor, managed };
}

function assertPathsSafe(project, paths) {
  for (const file of [paths.destination, paths.vendor, paths.managed]) assertSafePath(project, file);
}

function readMetadata(paths) {
  const stat = lstatMaybe(paths.metadata);
  if (!stat) return null;
  assertRegularManagedFile(paths.metadata, RTK_METADATA_FILE);
  if (stat.size > RTK_MAX_METADATA_BYTES) throw fail('Unmanaged RTK metadata collision requires manual review.');
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(paths.metadata, 'utf8'));
  } catch {
    throw fail('Unmanaged RTK metadata collision requires manual review.');
  }
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)
    || metadata.format !== RTK_METADATA_FORMAT || metadata.product !== RTK_PRODUCT
    || typeof metadata.target !== 'string' || metadata.files === null || typeof metadata.files !== 'object') {
    throw fail('Unmanaged RTK metadata collision requires manual review.');
  }
  return metadata;
}

function pinnedMetadata(metadata, target) {
  return metadata.version === RTK_VERSION
    && metadata.tag === RTK_TAG
    && metadata.commit === RTK_COMMIT
    && metadata.target === target.key
    && metadata.platform === target.platform
    && metadata.arch === target.arch
    && metadata.binary === target.binary
    && metadata.license === RTK_LICENSE
    && metadata.archive?.name === target.archive
    && metadata.archive?.format === target.format
    && metadata.archive?.sha256 === target.sha256;
}

function modeIsExecutable(stat) {
  return process.platform === 'win32' || (stat.mode & 0o100) !== 0;
}

function inspectManaged(project, target) {
  const paths = pathsFor(project);
  paths.metadata = path.join(paths.managed, RTK_METADATA_FILE);
  paths.binary = path.join(paths.managed, target.binary);
  paths.license = path.join(paths.managed, RTK_LICENSE_NAME);
  assertPathsSafe(project, paths);
  const managedStat = lstatMaybe(paths.managed);
  if (!managedStat) return { state: 'absent', paths };
  if (managedStat.isSymbolicLink() || !managedStat.isDirectory()) {
    throw fail(`Unmanaged RTK collision at ${path.relative(project, paths.managed)}; remove it manually or use --no-rtk.`);
  }
  const names = readdirSync(paths.managed, { withFileTypes: true });
  const seen = new Set();
  for (const entry of names) {
    if (!RTK_MANAGED_NAMES.has(entry.name)) {
      throw fail(`Unmanaged file in the RTK directory requires manual review: ${entry.name}`);
    }
    if (seen.has(entry.name)) throw fail(`Duplicate RTK directory entry requires manual review: ${entry.name}`);
    seen.add(entry.name);
    if (entry.isSymbolicLink()) throw fail(`Refusing symlinked RTK management path: ${entry.name}`);
  }
  if (seen.has('rtk') && seen.has('rtk.exe')) throw fail('Ambiguous RTK managed directory contains two binaries.');
  for (const name of seen) assertRegularManagedFile(path.join(paths.managed, name), name);
  const metadata = readMetadata(paths);
  if (!metadata) throw fail('Unmanaged RTK directory without toolkit metadata requires manual review.');

  const files = {};
  for (const name of [target.binary, RTK_LICENSE_NAME]) {
    const file = path.join(paths.managed, name);
    if (!lstatMaybe(file)) continue;
    const stat = assertRegularManagedFile(file, name);
    const cap = name === target.binary ? RTK_MAX_BINARY_BYTES : RTK_MAX_LICENSE_BYTES;
    if (stat.size > cap) throw fail(`RTK managed file exceeds its size limit: ${name}`);
    files[name] = { sha256: hash(readFileSync(file)), size: stat.size, executable: modeIsExecutable(stat) };
  }
  const expectedNames = [target.binary, RTK_LICENSE_NAME, RTK_METADATA_FILE].sort();
  const actualNames = [...seen].sort();
  const namesMatch = expectedNames.length === actualNames.length && expectedNames.every((name, index) => name === actualNames[index]);
  const metadataFilesMatch = files[target.binary]?.sha256 === metadata.files?.[target.binary]?.sha256
    && files[target.binary]?.size === metadata.files?.[target.binary]?.size
    && files[RTK_LICENSE_NAME]?.sha256 === metadata.files?.[RTK_LICENSE_NAME]?.sha256
    && files[RTK_LICENSE_NAME]?.size === metadata.files?.[RTK_LICENSE_NAME]?.size
    && files[target.binary]?.executable === true;
  const verified = namesMatch && pinnedMetadata(metadata, target) && metadataFilesMatch;
  return { state: verified ? 'verified' : 'stale', paths, metadata, files, names: seen };
}

function describeTarget(target) {
  return {
    state: 'unsupported',
    error: fail(`RTK OSS v${RTK_VERSION} has no reviewed binary for ${target}.`),
  };
}

function metadataTextFor(target, extracted) {
  const files = {
    [target.binary]: { sha256: hash(extracted.binary), size: extracted.binary.length },
    [RTK_LICENSE_NAME]: { sha256: hash(extracted.license), size: extracted.license.length },
  };
  const metadata = {
    format: RTK_METADATA_FORMAT,
    product: RTK_PRODUCT,
    edition: RTK_EDITION,
    version: RTK_VERSION,
    tag: RTK_TAG,
    commit: RTK_COMMIT,
    target: target.key,
    platform: target.platform,
    arch: target.arch,
    binary: target.binary,
    license: RTK_LICENSE,
    archive: { name: target.archive, format: target.format, sha256: target.sha256 },
    files,
    source: RTK_RELEASE_PAGE,
    runtimeTested: false,
  };
  return { metadata, metadataText: `${JSON.stringify(metadata, null, 2)}\n`, files };
}

function verifyManaged(project, target, expected) {
  const paths = pathsFor(project);
  paths.metadata = path.join(paths.managed, RTK_METADATA_FILE);
  assertPathsSafe(project, paths);
  const names = readdirSync(paths.managed).sort();
  const expectedNames = [target.binary, RTK_LICENSE_NAME, RTK_METADATA_FILE].sort();
  if (names.length !== expectedNames.length || expectedNames.some((name, index) => name !== names[index])) {
    throw fail('RTK activation produced an unexpected managed file set.');
  }
  for (const [name, file] of [[target.binary, path.join(paths.managed, target.binary)], [RTK_LICENSE_NAME, path.join(paths.managed, RTK_LICENSE_NAME)]]) {
    const stat = assertRegularManagedFile(file, name);
    const data = readFileSync(file);
    if (data.length !== expected.files[name].size || hash(data) !== expected.files[name].sha256) {
      throw fail(`RTK activation verification failed for ${name}.`);
    }
    if (name === target.binary && !modeIsExecutable(stat)) throw fail('RTK binary is not executable after activation.');
  }
  const metadataFile = path.join(paths.managed, RTK_METADATA_FILE);
  assertRegularManagedFile(metadataFile, RTK_METADATA_FILE);
  if (readFileSync(metadataFile, 'utf8') !== expected.metadataText) {
    throw fail('RTK activation verification failed for metadata.json.');
  }
}

function removeManagedDirectory(project, directory, target) {
  for (const name of [target.binary, RTK_LICENSE_NAME, RTK_METADATA_FILE]) {
    try { unlinkAnchored(path.join(directory, name), { root: project }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Recursive directory removal remains path-based on all platforms. Known file
  // deletion above uses the probe-selected backend, but concurrent directory
  // replacement during recursive cleanup is an OS-level residual.
  rmSync(directory, { recursive: true, force: true });
}

function stageManaged(project, target, extracted, metadata, hooks) {
  const paths = pathsFor(project);
  // Validate existing components before creating the vendor or staging
  // directories. Recursive removal remains path-based and is documented.
  assertPathsSafe(project, paths);
  const vendorStat = lstatMaybe(paths.vendor);
  if (vendorStat) {
    if (vendorStat.isSymbolicLink() || !vendorStat.isDirectory()) {
      throw fail(`Unmanaged vendor collision at ${path.relative(project, paths.vendor)} requires manual review.`);
    }
  } else {
    mkdirSync(paths.vendor, { mode: 0o755 });
  }
  const staging = path.join(paths.vendor, `.rtk-staging-${process.pid}-${randomUUID()}`);
  assertSafePath(project, staging);
  mkdirSync(staging, { recursive: false, mode: 0o700 });
  const write = (name, content, mode) => {
    const file = path.join(staging, name);
    writeFileAnchored(file, content, { mode, root: project, afterTempCreate: () => hooks?.afterStageTemp?.(name) });
  };
  try {
    write(target.binary, extracted.binary, 0o755);
    write(RTK_LICENSE_NAME, extracted.license, 0o644);
    write(RTK_METADATA_FILE, metadata.metadataText, 0o644);
    for (const name of [target.binary, RTK_LICENSE_NAME, RTK_METADATA_FILE]) {
      const stat = assertRegularManagedFile(path.join(staging, name), name);
      if (name === target.binary && !modeIsExecutable(stat)) throw fail('RTK binary was not staged as executable.');
      if (name !== target.binary && (stat.mode & 0o111) !== 0 && process.platform !== 'win32') {
        throw fail(`RTK staged file unexpectedly has executable bits: ${name}`);
      }
    }
  } catch (error) {
    try { removeManagedDirectory(project, staging, target); } catch {}
    throw error;
  }
  return { staging, expected: metadata };
}

function promoteManaged(project, target, staged, hooks) {
  const paths = pathsFor(project);
  assertPathsSafe(project, paths);
  const stagedStat = lstatMaybe(staged.staging);
  if (!stagedStat || stagedStat.isSymbolicLink() || !stagedStat.isDirectory()) {
    throw fail('RTK staging directory is missing or unsafe before activation.');
  }
  const backup = path.join(paths.vendor, `.rtk-backup-${process.pid}-${randomUUID()}`);
  const hadManaged = Boolean(lstatMaybe(paths.managed));
  let backupActive = false;
  let promoted = false;
  try {
    if (hadManaged) {
      renameAnchored(paths.managed, backup, { root: project });
      backupActive = true;
    }
    try {
      renameAnchored(staged.staging, paths.managed, { root: project });
    } catch (error) {
      if (backupActive) {
        renameAnchored(backup, paths.managed, { root: project });
        backupActive = false;
      }
      throw error;
    }
    promoted = true;
    if (typeof hooks?.afterPromote === 'function') hooks.afterPromote();
    verifyManaged(project, target, staged.expected);
    backupActive = false;
    try { removeManagedDirectory(project, backup, target); } catch {}
  } catch (error) {
    let rollbackFailure = null;
    try {
      if (promoted) {
        const discard = path.join(paths.vendor, `.rtk-failed-${process.pid}-${randomUUID()}`);
        renameAnchored(paths.managed, discard, { root: project });
        if (backupActive) {
          renameAnchored(backup, paths.managed, { root: project });
          backupActive = false;
        }
        try { removeManagedDirectory(project, discard, target); } catch {}
      } else if (backupActive) {
        renameAnchored(backup, paths.managed, { root: project });
        backupActive = false;
      }
    } catch (rollbackError) {
      rollbackFailure = rollbackError;
    }
    try { removeManagedDirectory(project, staged.staging, target); } catch {}
    if (rollbackFailure) {
      throw fail(`RTK activation failed and rollback did not complete (${rollbackFailure.message}). Review ${path.relative(project, paths.vendor)} and use --no-rtk if needed.`, error);
    }
    const outcome = hadManaged
      ? 'the previous managed installation was restored'
      : 'no managed installation remains';
    throw fail(`RTK activation failed; ${outcome}: ${error.message}`, error);
  }
}

function selectTarget({ target, platform, arch }) {
  if (target === undefined) return resolveRtkTarget(platform, arch);
  if (target === null || typeof target !== 'object'
    || typeof target.key !== 'string' || typeof target.platform !== 'string' || typeof target.arch !== 'string'
    || (target.format !== 'tar.gz' && target.format !== 'zip')
    || typeof target.archive !== 'string' || !/^[A-Za-z0-9._-]+$/.test(target.archive)
    || typeof target.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(target.sha256)
    || (target.binary !== 'rtk' && target.binary !== 'rtk.exe')) {
    throw fail('Invalid internal RTK target.');
  }
  return target;
}

async function provision({ project = process.cwd(), platform = process.platform, arch = process.arch,
  fetchImpl = globalThis.fetch, timeoutMs, maxBytes, validateToolkit, hooks, target: injectedTarget } = {}) {
  const target = selectTarget({ target: injectedTarget, platform, arch });
  const root = path.resolve(project);
  if (validateToolkit !== undefined) {
    await validateToolkit({ project: root });
  } else {
    installToolkit({ project: root, dryRun: true });
  }
  const paths = pathsFor(root);
  paths.metadata = path.join(paths.managed, RTK_METADATA_FILE);
  paths.binary = path.join(paths.managed, target.binary);
  paths.license = path.join(paths.managed, RTK_LICENSE_NAME);
  assertPathsSafe(root, paths);
  const destination = lstatMaybe(paths.destination);
  if (!destination || destination.isSymbolicLink() || !destination.isDirectory()) {
    throw fail('The project toolkit installation is missing; install it first without --no-rtk.');
  }
  const before = inspectManaged(root, target);
  const resultBase = {
    version: RTK_VERSION,
    tag: RTK_TAG,
    commit: RTK_COMMIT,
    edition: RTK_EDITION,
    license: RTK_LICENSE,
    target: target.key,
    archiveSha256: target.sha256,
    binaryPath: paths.binary,
    relativeBinaryPath: path.relative(root, paths.binary),
    runtimeTested: false,
  };
  if (before.state === 'verified') return { state: 'verified', downloaded: false, ...resultBase };

  const download = await downloadRtkArchive({ target, fetchImpl, timeoutMs, maxBytes });
  const extracted = await extractRtkArchive(download.archive, target);
  const metadata = metadataTextFor(target, extracted);
  assertPathsSafe(root, paths);
  const current = inspectManaged(root, target);
  if (current.state === 'verified') return { state: 'verified', downloaded: false, ...resultBase };
  const staged = stageManaged(root, target, extracted, metadata, hooks);
  promoteManaged(root, target, staged, hooks);
  return { state: 'installed', downloaded: true, ...resultBase };
}

export async function provisionRtk(options = {}) {
  try {
    return await provision(options);
  } catch (error) {
    if (error?.code === 'RTK_UNSUPPORTED_TARGET') throw error;
    throw wrap(error);
  }
}

export function rtkStatus({ project = process.cwd(), platform = process.platform, arch = process.arch, target: injectedTarget } = {}) {
  let target;
  try {
    target = selectTarget({ target: injectedTarget, platform, arch });
  } catch (error) {
    return describeTarget(`${platform}-${arch}`);
  }
  const root = path.resolve(project);
  let inspected;
  try {
    inspected = inspectManaged(root, target);
  } catch (error) {
    throw wrap(error);
  }
  return {
    state: inspected.state,
    target: target.key,
    version: RTK_VERSION,
    tag: RTK_TAG,
    edition: RTK_EDITION,
    license: RTK_LICENSE,
    binaryPath: path.join(root, RTK_VENDOR_RELATIVE, target.binary),
    relativeBinaryPath: path.join(RTK_VENDOR_RELATIVE, target.binary),
    downloaded: false,
  };
}
