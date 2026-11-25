import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync, gzipSync } from 'node:zlib';
import test from 'node:test';
import { main } from '../lib/rtk-cli.mjs';
import { provisionRtk, rtkStatus, RTK_METADATA_FILE } from '../lib/rtk.mjs';
import { downloadRtkArchive } from '../lib/rtk-download.mjs';
import {
  RTK_COMMIT, RTK_TARGETS, RTK_VERSION, resolveRtkTarget,
} from '../lib/rtk-catalog.mjs';

const linux = resolveRtkTarget('linux', 'x64');
const windows = resolveRtkTarget('win32', 'x64');
const hash = value => createHash('sha256').update(value).digest('hex');
const fixtureTarget = (base, archive) => ({ ...base, sha256: hash(archive) });

function projectFixture(t) {
  const project = mkdtempSync(path.join(os.tmpdir(), 'rtk-project-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  mkdirSync(path.join(project, '.opencode'));
  return project;
}
function emptyFixture(t) {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'rtk-parent-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return parent;
}
function tarHeader(name, size) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}
function tarArchive() {
  const parts = [];
  for (const [name, data] of [['rtk', 'fake rtk binary'], ['LICENSE', 'Apache License 2.0 fixture']]) {
    const content = Buffer.from(data);
    parts.push(tarHeader(name, content.length), content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}
const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function zipArchive() {
  const entries = [['LICENSE', Buffer.from('zip license')], ['rtk.exe', Buffer.from('zip binary')]];
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [nameString, data] of entries) {
    const name = Buffer.from(nameString);
    const compressed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0014, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}
const response = archive => new Response(archive, { status: 200 });
const noValidation = () => {};

async function closesWithin(promise, milliseconds = 750) {
  return Promise.race([
    promise.then(() => true),
    new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), milliseconds);
      timer.unref?.();
    }),
  ]);
}

async function withLocalTransport(handler, callback) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(new Promise(resolve => response.once('close', resolve)));
    handler(request, response, requests.length);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}/asset`, requests);
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
}

test('catalog pins the reviewed OSS assets and rejects unsupported targets', () => {
  assert.deepEqual(Object.keys(RTK_TARGETS), ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64']);
  for (const target of Object.values(RTK_TARGETS)) {
    assert.match(target.sha256, /^[0-9a-f]{64}$/);
    assert.ok(target.archive.startsWith('rtk-oss-'));
    assert.ok(target.binary === 'rtk' || target.binary === 'rtk.exe');
  }
  assert.equal(RTK_VERSION, '1.2.1');
  assert.equal(RTK_COMMIT, 'd0f0399a5ff8cd1d81325a033f0b2d8864d665f6');
  assert.throws(() => resolveRtkTarget('linux', 'ia32'), /no reviewed binary.*linux-ia32.*--no-rtk/is);
});

test('downloader follows bounded HTTPS redirects, verifies SHA-256, and does not leak signed URLs', async () => {
  const archive = Buffer.from('pinned archive payload');
  const target = { ...linux, sha256: hash(archive) };
  let calls = 0;
  const fetchImpl = async url => {
    calls++;
    if (calls === 1) {
      assert.equal(url.hostname, 'github.com');
      return new Response(null, {
        status: 302,
        headers: { location: 'https://release-assets.githubusercontent.com/blob/asset?token=topsecret' },
      });
    }
    return response(archive);
  };
  const result = await downloadRtkArchive({ target, fetchImpl });
  assert.equal(calls, 2);
  assert.deepEqual(result.archive, archive);
  assert.equal(result.sha256, target.sha256);

  const failing = async url => (url.hostname === 'github.com'
    ? new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/blob/asset?token=topsecret' } })
    : new Response('missing', { status: 503 }));
  const downloadError = await downloadRtkArchive({ target, fetchImpl: failing }).then(() => null, error => error);
  assert.ok(downloadError);
  assert.match(downloadError.message, /HTTP 503/);
  assert.doesNotMatch(downloadError.message, /topsecret|release-assets/i);
});

test('downloader rejects unexpected redirects, timeouts, oversized bodies and checksum mismatches', async () => {
  const target = { ...linux, sha256: hash(Buffer.from('expected')) };
  await assert.rejects(downloadRtkArchive({
    target,
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/asset' } }),
  }), /unexpected host/i);
  await assert.rejects(downloadRtkArchive({
    target,
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://release-assets.githubusercontent.com/asset' } }),
  }), /HTTPS/);
  await assert.rejects(downloadRtkArchive({
    target,
    timeoutMs: 20,
    fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  }), /timed out/i);
  await assert.rejects(downloadRtkArchive({
    target,
    maxBytes: 8,
    fetchImpl: async () => response(Buffer.alloc(32)),
  }), /download limit/i);
  await assert.rejects(downloadRtkArchive({
    target,
    maxRedirects: 1,
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://github.com/rtk-ai/rtk/releases/download/v1.2.1/loop' } }),
  }), /exceeded 1 redirects/i);
  await assert.rejects(downloadRtkArchive({
    target,
    fetchImpl: async () => ({
      status: 200,
      headers: { get: () => 'invalid' },
      body: { cancel: async () => {} },
    }),
  }), /invalid content length/i);
  await assert.rejects(downloadRtkArchive({
    target,
    maxBytes: 8,
    fetchImpl: async () => ({
      status: 200,
      headers: { get: () => '999999' },
      body: { cancel: async () => {} },
    }),
  }), /download limit/i);
  await assert.rejects(downloadRtkArchive({
    target,
    fetchImpl: async () => response(Buffer.from('wrong')),
  }), /checksum mismatch/i);
  await assert.rejects(downloadRtkArchive({
    target,
    fetchImpl: async () => new Response('not found', { status: 404 }),
  }), /HTTP 404/i);
});

test('failed downloads abort and dispose active local transports before returning', async () => {
  const target = { ...linux, sha256: hash(Buffer.from('unused')) };
  const cases = [
    {
      name: 'HTTP 404 unfinished body',
      handler: response => {
        response.writeHead(404, { 'content-type': 'application/octet-stream' });
        response.write('partial');
      },
      expected: /HTTP 404/,
    },
    {
      name: 'invalid content length',
      handler: response => {
        response.writeHead(200, { 'content-length': 'invalid' });
        response.write('partial');
      },
      expected: /invalid content length|RTK download failed/i,
    },
    {
      name: 'oversized content length',
      handler: response => {
        response.writeHead(200, { 'content-length': '999999' });
        response.write('partial');
      },
      expected: /download limit/,
      options: { maxBytes: 8 },
    },
    {
      name: 'redirect limit',
      handler: response => {
        response.writeHead(302, { location: 'https://github.com/rtk-ai/rtk/releases/download/v1.2.1/loop' });
        response.write('partial');
      },
      expected: /exceeded 1 redirects/,
      options: { maxRedirects: 1 },
    },
    {
      name: 'unexpected redirect host',
      handler: response => {
        response.writeHead(302, { location: 'https://evil.example/asset' });
        response.write('partial');
      },
      expected: /unexpected host/,
    },
    {
      name: 'signed redirect than HTTP failure does not leak the URL',
      handler: (response, requestNumber) => {
        if (requestNumber === 1) {
          response.writeHead(302, { location: 'https://release-assets.githubusercontent.com/blob?token=topsecret' });
        } else {
          response.writeHead(500, { 'content-type': 'text/plain' });
        }
        response.write('partial');
      },
      expected: /HTTP 500/,
      secret: true,
    },
  ];
  for (const current of cases) {
    await withLocalTransport((request, response, requestNumber) => current.handler(response, requestNumber), async (localUrl, requests) => {
      const fetchImpl = (url, options) => fetch(localUrl, options);
      const error = await downloadRtkArchive({ target, fetchImpl, timeoutMs: 2000, ...current.options })
        .then(() => null, failure => failure);
      assert.ok(error, current.name);
      assert.match(error.message, current.expected, current.name);
      if (current.secret) assert.doesNotMatch(error.message, /topsecret|release-assets/i, current.name);
      assert.ok(requests.length > 0, current.name);
      assert.equal(await closesWithin(Promise.all(requests)), true, current.name);
    });
  }
});

test('provisioning installs a pinned managed RTK layout and reuses it without a request', async t => {
  const project = projectFixture(t);
  const archive = tarArchive();
  const target = fixtureTarget(linux, archive);
  let calls = 0;
  const installed = await provisionRtk({
    project,
    target,
    fetchImpl: async () => { calls++; return response(archive); },
    validateToolkit: noValidation,
  });
  assert.equal(calls, 1);
  assert.equal(installed.state, 'installed');
  assert.equal(installed.downloaded, true);
  assert.equal(installed.target, 'linux-x64');
  const directory = path.join(project, '.opencode/vendor/rtk');
  assert.deepEqual(readdirSync(directory).sort(), ['LICENSE', 'metadata.json', 'rtk']);
  const binary = readFileSync(path.join(directory, 'rtk'));
  const license = readFileSync(path.join(directory, 'LICENSE'));
  const metadata = JSON.parse(readFileSync(path.join(directory, RTK_METADATA_FILE), 'utf8'));
  assert.equal(metadata.version, RTK_VERSION);
  assert.equal(metadata.tag, 'v1.2.1');
  assert.equal(metadata.commit, RTK_COMMIT);
  assert.equal(metadata.target, 'linux-x64');
  assert.equal(metadata.archive.sha256, target.sha256);
  assert.equal(metadata.files.rtk.sha256, hash(binary));
  assert.equal(metadata.files.LICENSE.sha256, hash(license));
  assert.equal(metadata.runtimeTested, false);
  if (process.platform !== 'win32') {
    assert.notEqual(statSync(path.join(directory, 'rtk')).mode & 0o100, 0);
    assert.equal(statSync(path.join(directory, 'LICENSE')).mode & 0o111, 0);
    assert.equal(statSync(path.join(directory, RTK_METADATA_FILE)).mode & 0o111, 0);
  }

  const verified = await provisionRtk({
    project,
    target,
    fetchImpl: () => { throw new Error('must not download'); },
    validateToolkit: noValidation,
  });
  assert.equal(verified.state, 'verified');
  assert.equal(verified.downloaded, false);
  assert.deepEqual(readFileSync(path.join(directory, 'rtk')), binary);
  assert.equal(readFileSync(path.join(directory, 'LICENSE'), 'utf8'), 'Apache License 2.0 fixture');
});

test('provisioning installs the Windows zip target with rtk.exe', async t => {
  const project = projectFixture(t);
  const archive = zipArchive();
  const target = fixtureTarget(windows, archive);
  const installed = await provisionRtk({
    project,
    target,
    fetchImpl: async () => response(archive),
    validateToolkit: noValidation,
  });
  assert.equal(installed.state, 'installed');
  assert.equal(installed.target, 'win32-x64');
  assert.match(installed.relativeBinaryPath, /rtk\.exe$/);
  const directory = path.join(project, '.opencode/vendor/rtk');
  assert.deepEqual(readdirSync(directory).sort(), ['LICENSE', 'metadata.json', 'rtk.exe']);
  const status = rtkStatus({ project, target });
  assert.equal(status.state, 'verified');
});

test('provisioning failures before the request leave an absent or existing managed install untouched', async t => {
  const project = projectFixture(t);
  const vendor = path.join(project, '.opencode/vendor');
  mkdirSync(vendor);
  writeFileSync(path.join(vendor, 'rtk'), 'unmanaged collision');
  let calls = 0;
  await assert.rejects(provisionRtk({
    project,
    validateToolkit: noValidation,
    fetchImpl: () => { calls++; throw new Error('must not download'); },
  }), /Unmanaged RTK collision/i);
  assert.equal(calls, 0);

  const missingMetadata = projectFixture(t);
  mkdirSync(path.join(missingMetadata, '.opencode/vendor/rtk'), { recursive: true });
  writeFileSync(path.join(missingMetadata, '.opencode/vendor/rtk/rtk'), 'unmanaged');
  await assert.rejects(provisionRtk({
    project: missingMetadata,
    validateToolkit: noValidation,
    fetchImpl: () => { calls++; throw new Error('must not download'); },
  }), /without toolkit metadata/i);
  assert.equal(calls, 0);

  const installed = projectFixture(t);
  const archive = tarArchive();
  const target = fixtureTarget(linux, archive);
  await provisionRtk({ project: installed, target, fetchImpl: async () => response(archive), validateToolkit: noValidation });
  const binary = path.join(installed, '.opencode/vendor/rtk/rtk');
  writeFileSync(binary, 'prior managed bytes');
  const metadata = readFileSync(path.join(installed, '.opencode/vendor/rtk', RTK_METADATA_FILE), 'utf8');
  await assert.rejects(provisionRtk({
    project: installed,
    validateToolkit: noValidation,
    fetchImpl: async () => { throw new Error('offline'); },
  }), /RTK download failed/i);
  assert.equal(readFileSync(binary, 'utf8'), 'prior managed bytes');
  assert.equal(readFileSync(path.join(installed, '.opencode/vendor/rtk', RTK_METADATA_FILE), 'utf8'), metadata);
});

test('unmanaged links and hardlinks are rejected before any download', { skip: process.platform === 'win32' }, async t => {
  const project = projectFixture(t);
  const external = path.join(emptyFixture(t), 'external');
  writeFileSync(external, 'external bytes');
  mkdirSync(path.join(project, '.opencode/vendor'), { recursive: true });
  symlinkSync(external, path.join(project, '.opencode/vendor/rtk'));
  let calls = 0;
  await assert.rejects(provisionRtk({
    project,
    validateToolkit: noValidation,
    fetchImpl: () => { calls++; throw new Error('must not download'); },
  }), /symlink/i);
  assert.equal(calls, 0);

  const hardlinked = projectFixture(t);
  const hardlinkArchive = tarArchive();
  const hardlinkTarget = fixtureTarget(linux, hardlinkArchive);
  await provisionRtk({
    project: hardlinked,
    target: hardlinkTarget,
    fetchImpl: async () => response(hardlinkArchive),
    validateToolkit: noValidation,
  });
  const binary = path.join(hardlinked, '.opencode/vendor/rtk/rtk');
  rmSync(binary);
  linkSync(external, binary);
  await assert.rejects(provisionRtk({
    project: hardlinked,
    validateToolkit: noValidation,
    fetchImpl: () => { calls++; throw new Error('must not download'); },
  }), /hardlinked/i);
  assert.equal(calls, 0);
});

test('activation failure restores the previous managed installation', async t => {
  const project = projectFixture(t);
  const archive = tarArchive();
  const target = fixtureTarget(linux, archive);
  await provisionRtk({ project, target, fetchImpl: async () => response(archive), validateToolkit: noValidation });
  const binary = path.join(project, '.opencode/vendor/rtk/rtk');
  writeFileSync(binary, 'prior managed bytes');
  await assert.rejects(provisionRtk({
    project,
    target,
    fetchImpl: async () => response(archive),
    validateToolkit: noValidation,
    hooks: { afterPromote: () => { throw new Error('injected activation fault'); } },
  }), /previous managed installation was restored/i);
  assert.equal(readFileSync(binary, 'utf8'), 'prior managed bytes');
  assert.equal(rtkStatus({ project, target }).state, 'stale');
});

test('first-install activation failure leaves no managed installation behind', async t => {
  const project = projectFixture(t);
  const archive = tarArchive();
  await assert.rejects(provisionRtk({
    project,
    target: fixtureTarget(linux, archive),
    fetchImpl: async () => response(archive),
    validateToolkit: noValidation,
    hooks: { afterPromote: () => { throw new Error('injected activation fault'); } },
  }), /no managed installation remains/i);
  assert.equal(existsSync(path.join(project, '.opencode/vendor/rtk')), false);
  assert.deepEqual(readdirSync(path.join(project, '.opencode/vendor')), []);
});

test('CLI help documents the default managed RTK provisioning and offline switch', async () => {
  const lines = [];
  const code = await main(['--help'], {
    provision: async () => { throw new Error('must not provision'); },
    log: line => lines.push(line),
    error: line => lines.push(line),
  });
  assert.equal(code, 0);
  const output = lines.join('\n');
  assert.match(output, /RTK OSS v1\.2\.1 \(Apache-2\.0\)/);
  assert.match(output, /\.opencode\/vendor\/rtk\/rtk/);
  assert.match(output, /SHA-256/);
  assert.match(output, /never executed/);
  assert.match(output, /runtime behavior is not tested/);
  assert.match(output, /--no-rtk/);
});

test('CLI dry-run and --no-rtk make no RTK request or write and do not call provisioning', async t => {
  const parent = emptyFixture(t);
  const missing = path.join(parent, 'not-created');
  const dryLines = [];
  const dryErrors = [];
  let provisionCalls = 0;
  const dry = await main(['--project', missing, '--dry-run'], {
    provision: async () => { provisionCalls++; },
    log: line => dryLines.push(line),
    error: line => dryErrors.push(line),
  });
  assert.equal(dry, 0);
  assert.equal(provisionCalls, 0);
  assert.equal(existsSync(missing), false);
  assert.match(dryLines.join('\n'), /DRY RUN/);
  assert.match(dryLines.join('\n'), /would be downloaded and installed/);
  assert.match(dryLines.join('\n'), /dry run, no request/);
  assert.deepEqual(dryErrors, []);

  const skipProject = path.join(parent, 'skip');
  const skipLines = [];
  const skip = await main(['--project', skipProject, '--no-rtk'], {
    provision: async () => { provisionCalls++; },
    log: line => skipLines.push(line),
    error: line => skipLines.push(line),
  });
  assert.equal(skip, 0);
  assert.equal(provisionCalls, 0);
  assert.ok(existsSync(path.join(skipProject, '.opencode/toolkit-manifest.json')));
  assert.equal(existsSync(path.join(skipProject, '.opencode/vendor')), false);
  assert.match(skipLines.join('\n'), /skipped by --no-rtk/);
});

test('unmanaged extra files and malformed metadata are rejected before any download', async t => {
  const archive = tarArchive();
  const target = fixtureTarget(linux, archive);
  let calls = 0;
  const extra = projectFixture(t);
  await provisionRtk({ project: extra, target, fetchImpl: async () => response(archive), validateToolkit: noValidation });
  writeFileSync(path.join(extra, '.opencode/vendor/rtk/unexpected.txt'), 'extra');
  await assert.rejects(provisionRtk({
    project: extra,
    target,
    validateToolkit: noValidation,
    fetchImpl: () => { calls++; throw new Error('must not download'); },
  }), /Unmanaged file/i);

  const malformed = projectFixture(t);
  await provisionRtk({ project: malformed, target, fetchImpl: async () => response(archive), validateToolkit: noValidation });
  writeFileSync(path.join(malformed, '.opencode/vendor/rtk', RTK_METADATA_FILE), 'not json');
  await assert.rejects(provisionRtk({
    project: malformed,
    target,
    validateToolkit: noValidation,
    fetchImpl: () => { calls++; throw new Error('must not download'); },
  }), /metadata collision/i);
  assert.equal(calls, 0);
});

test('--no-rtk leaves an existing managed installation untouched', async t => {
  const project = projectFixture(t);
  const archive = tarArchive();
  const target = fixtureTarget(linux, archive);
  await provisionRtk({ project, target, fetchImpl: async () => response(archive), validateToolkit: noValidation });
  const directory = path.join(project, '.opencode/vendor/rtk');
  const binary = readFileSync(path.join(directory, 'rtk'));
  const metadata = readFileSync(path.join(directory, RTK_METADATA_FILE), 'utf8');
  const lines = [];
  const code = await main(['--project', project, '--no-rtk'], {
    provision: async () => { throw new Error('must not provision'); },
    log: line => lines.push(line),
    error: line => lines.push(line),
  });
  assert.equal(code, 0);
  assert.deepEqual(readFileSync(path.join(directory, 'rtk')), binary);
  assert.equal(readFileSync(path.join(directory, RTK_METADATA_FILE), 'utf8'), metadata);
  assert.deepEqual(readdirSync(directory).sort(), ['LICENSE', 'metadata.json', 'rtk']);

  const dryLines = [];
  const dry = await main(['--project', project, '--dry-run'], {
    provision: async () => { throw new Error('must not provision'); },
    statusFn: () => rtkStatus({ project, target }),
    log: line => dryLines.push(line),
    error: line => dryLines.push(line),
  });
  assert.equal(dry, 0);
  assert.match(dryLines.join('\n'), /existing managed install .* would be verified/);
});

test('CLI rejects an unsupported RTK target before any toolkit write', async t => {
  const parent = emptyFixture(t);
  const project = path.join(parent, 'unsupported');
  const errors = [];
  let provisionCalls = 0;
  const code = await main(['--project', project], {
    statusFn: () => ({ state: 'unsupported', error: new Error('no reviewed binary. Use --no-rtk to install the toolkit without RTK.') }),
    provision: async () => { provisionCalls++; },
    log: () => {},
    error: line => errors.push(line),
  });
  assert.equal(code, 1);
  assert.equal(provisionCalls, 0);
  assert.equal(existsSync(project), false);
  assert.match(errors.join('\n'), /Installation failed: no reviewed binary/);
  assert.match(errors.join('\n'), /--no-rtk/);
});

test('CLI default calls provisioning once and reports success only after it completes', async t => {
  const project = projectFixture(t);
  const lines = [];
  let calls = 0;
  let validated = false;
  const code = await main(['--project', project], {
    provision: async options => {
      calls++;
      validated = typeof options.validateToolkit === 'function';
      return {
        state: 'installed', downloaded: true, version: RTK_VERSION, target: 'linux-x64',
        license: 'Apache-2.0', relativeBinaryPath: '.opencode/vendor/rtk/rtk',
      };
    },
    log: line => lines.push(line),
    error: line => lines.push(line),
  });
  assert.equal(code, 0);
  assert.equal(calls, 1);
  assert.equal(validated, true);
  assert.equal(lines[0], `Installed: ${project}`);
  assert.match(lines.at(-1), /RTK OSS v1\.2\.1 installed at \.opencode\/vendor\/rtk\/rtk/);
});

test('CLI reports a truthful partial install when toolkit succeeds but RTK fails', async t => {
  const project = projectFixture(t);
  const lines = [];
  const errors = [];
  const code = await main(['--project', project], {
    provision: async () => { throw new Error('injected network failure Use --no-rtk to skip.'); },
    log: line => lines.push(line),
    error: line => errors.push(line),
  });
  assert.equal(code, 1);
  assert.equal(lines[0], `Toolkit installed, RTK not installed: ${project}`);
  assert.ok(existsSync(path.join(project, '.opencode/toolkit-manifest.json')));
  assert.equal(existsSync(path.join(project, '.opencode/vendor')), false);
  assert.match(errors.join('\n'), /RTK installation failed: injected network failure/);
  assert.match(errors.join('\n'), /toolkit is installed, but RTK provisioning did not complete/i);
});

test('rtkStatus reports absent, verified, stale and unsupported states without writes', async t => {
  const project = projectFixture(t);
  assert.equal(rtkStatus({ project }).state, 'absent');
  assert.equal(rtkStatus({ project, platform: 'linux', arch: 'ia32' }).state, 'unsupported');
  const archive = tarArchive();
  const target = fixtureTarget(linux, archive);
  await provisionRtk({ project, target, fetchImpl: async () => response(archive), validateToolkit: noValidation });
  assert.equal(rtkStatus({ project, target }).state, 'verified');
  writeFileSync(path.join(project, '.opencode/vendor/rtk/rtk'), 'tampered');
  assert.equal(rtkStatus({ project, target }).state, 'stale');
});
