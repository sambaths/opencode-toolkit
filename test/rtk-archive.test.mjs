import assert from 'node:assert/strict';
import { gzipSync, deflateRawSync } from 'node:zlib';
import test from 'node:test';
import { resolveRtkTarget } from '../lib/rtk-catalog.mjs';
import { extractRtkArchive } from '../lib/rtk-archive.mjs';

const linux = resolveRtkTarget('linux', 'x64');
const windows = resolveRtkTarget('win32', 'x64');

function tarHeader(name, size, { type = '0', linkname = '' } = {}) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, 'ascii');
  header.write(linkname, 157, 100, 'utf8');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

function tarArchive(entries, { end = true } = {}) {
  const parts = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? '');
    parts.push(tarHeader(entry.name, entry.size ?? data.length, entry));
    parts.push(data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding) parts.push(Buffer.alloc(padding));
  }
  if (end) parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

const gzip = entries => gzipSync(tarArchive(entries));
const validTarEntries = () => [
  { name: 'rtk', data: 'fake rtk binary' },
  { name: 'LICENSE', data: 'Apache License 2.0 fixture' },
];
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
function zipArchive(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data ?? '');
    const method = entry.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(data) : data;
    const flags = entry.flags ?? 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.madeBy ?? 0x0014, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.externalAttributes ?? 0, 38);
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

test('valid tar and zip archives expose only the expected binary and LICENSE', async () => {
  const tar = await extractRtkArchive(gzip(validTarEntries()), linux);
  assert.equal(tar.binaryName, 'rtk');
  assert.equal(tar.binary.toString(), 'fake rtk binary');
  assert.equal(tar.license.toString(), 'Apache License 2.0 fixture');

  const prefixed = await extractRtkArchive(gzip([
    { name: './rtk', data: 'prefixed binary' },
    { name: './LICENSE', data: 'licensed' },
  ]), linux);
  assert.equal(prefixed.binary.toString(), 'prefixed binary');

  const zip = await extractRtkArchive(zipArchive([
    { name: 'LICENSE', data: 'zip license', method: 8 },
    { name: 'rtk.exe', data: 'zip binary', method: 8 },
  ]), windows);
  assert.equal(zip.binaryName, 'rtk.exe');
  assert.equal(zip.binary.toString(), 'zip binary');
  assert.equal(zip.license.toString(), 'zip license');
});

test('tar archives reject traversal, absolute, nested, linked, duplicate, missing, unexpected and oversize entries', async () => {
  const cases = [
    [gzip([{ name: '../rtk', data: 'x' }, { name: 'LICENSE', data: 'l' }]), /unexpected|relative|unsafe|nested/i],
    [gzip([{ name: '/rtk', data: 'x' }, { name: 'LICENSE', data: 'l' }]), /absolute|unsafe/i],
    [gzip([{ name: 'dir/rtk', data: 'x' }, { name: 'LICENSE', data: 'l' }]), /nested|unexpected/i],
    [gzip([{ name: 'rtk', data: 'x', type: '2', linkname: 'LICENSE' }, { name: 'LICENSE', data: 'l' }]), /non-file|non-regular|linked/i],
    [gzip([{ name: 'rtk', data: 'x' }, { name: 'rtk', data: 'y' }, { name: 'LICENSE', data: 'l' }]), /duplicate/i],
    [gzip([{ name: 'rtk', data: 'x' }]), /missing LICENSE|expected binary and LICENSE/i],
    [gzip([...validTarEntries(), { name: 'README', data: 'extra' }]), /unexpected entry/i],
    [gzip([{ name: 'rtk', data: 'x' }, { name: 'LICENSE', data: 'l'.repeat(128 * 1024 + 1) }]), /size limit/i],
  ];
  for (const [archive, expected] of cases) {
    await assert.rejects(extractRtkArchive(archive, linux), expected);
  }
});

test('tar archives reject hidden headers after the first EOF marker and metadata headers', async () => {
  const valid = tarArchive(validTarEntries());
  const hidden = tarArchive([{ name: '../unexpected', data: 'hidden' }], { end: false });
  const duplicate = tarArchive([{ name: 'rtk', data: 'duplicate' }], { end: false });
  const cases = [
    [gzipSync(Buffer.concat([valid, hidden, Buffer.alloc(1024)])), /trailing|EOF|unexpected|header/i],
    [gzipSync(Buffer.concat([valid, duplicate, Buffer.alloc(1024)])), /trailing|EOF|duplicate|header/i],
    [gzipSync(tarArchive([
      { name: '../unexpected-metadata', type: 'L', data: 'rtk\0' },
      ...validTarEntries(),
    ])), /metadata|unsupported|non-regular|long/i],
    [gzipSync(tarArchive([
      { name: 'PaxHeader', type: 'x', data: '12 path=rtk\n' },
      ...validTarEntries(),
    ])), /metadata|unsupported|non-regular|pax/i],
  ];
  for (const [archive, expected] of cases) {
    await assert.rejects(extractRtkArchive(archive, linux), expected);
  }
});

test('tar archives reject bad gzip, truncated archives, nested compression and trailing data', async () => {
  await assert.rejects(extractRtkArchive(Buffer.from('not gzip'), linux), /gzip|invalid/i);
  await assert.rejects(extractRtkArchive(gzipSync(tarArchive(validTarEntries(), { end: false })), linux), /trailing|invalid|unexpected|EOF|truncated/i);
  await assert.rejects(extractRtkArchive(gzipSync(gzip(validTarEntries())), linux), /nested gzip/i);
  const valid = tarArchive(validTarEntries());
  await assert.rejects(extractRtkArchive(gzipSync(Buffer.concat([valid, Buffer.from('trailing')])), linux), /trailing|invalid/i);
  await assert.rejects(extractRtkArchive(gzipSync(Buffer.from('short')), linux), /short|invalid|trailing/i);
});

test('zip archives reject traversal, absolute, linked, directory, duplicate, missing, unexpected, encrypted and oversized entries', async () => {
  const license = { name: 'LICENSE', data: 'license' };
  const binary = { name: 'rtk.exe', data: 'binary' };
  const cases = [
    [zipArchive([{ name: '../rtk.exe', data: 'x' }, license]), /invalid|relative|unexpected/i],
    [zipArchive([{ name: '/rtk.exe', data: 'x' }, license]), /invalid|absolute/i],
    [zipArchive([{ name: 'dir/rtk.exe', data: 'x' }, license]), /nested|unexpected/i],
    [zipArchive([{ name: 'rtk.exe', data: 'target', madeBy: 0x0314, externalAttributes: (0o120777 << 16) >>> 0 }, license]), /link|special/i],
    [zipArchive([{ name: 'rtk/', data: '', externalAttributes: 0x10 }, license]), /directory/i],
    [zipArchive([binary, binary, license]), /duplicate/i],
    [zipArchive([binary]), /missing LICENSE/i],
    [zipArchive([binary, license, { name: 'README', data: 'x' }]), /unexpected entry/i],
    [zipArchive([{ ...binary, flags: 1 }, license]), /invalid|encrypted/i],
    [zipArchive([{ ...binary, method: 12, data: 'x' }, license]), /compression method/i],
    [zipArchive([binary, { name: 'LICENSE', data: 'l'.repeat(128 * 1024 + 1) }]), /size limit/i],
  ];
  for (const [archive, expected] of cases) {
    await assert.rejects(extractRtkArchive(archive, windows), expected);
  }
  await assert.rejects(extractRtkArchive(Buffer.from('not a zip'), windows), /zip|invalid/i);
});
