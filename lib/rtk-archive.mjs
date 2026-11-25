import { createGunzip } from 'node:zlib';
import { Header, Parser } from 'tar';
import yauzl from 'yauzl';

export const RTK_MAX_RAW_TAR_BYTES = 192 * 1024 * 1024;
export const RTK_MAX_BINARY_BYTES = 128 * 1024 * 1024;
export const RTK_MAX_LICENSE_BYTES = 128 * 1024;
export const RTK_MAX_META_BYTES = 16 * 1024;
export const RTK_LICENSE_NAME = 'LICENSE';

const failure = message => {
  const error = new Error(message);
  error.code = 'RTK_ARCHIVE_INVALID';
  return error;
};

function normalizeMemberName(name, target) {
  if (typeof name !== 'string' || !name) throw failure('RTK archive contains an empty entry name');
  if (name.startsWith('./')) name = name.slice(2);
  if (name.includes('\\') || name.includes('\0')) throw failure('RTK archive contains an unsafe entry name');
  if (name.startsWith('/') || name.startsWith('//') || /^[A-Za-z]:/.test(name)) {
    throw failure('RTK archive contains an absolute entry name');
  }
  const segments = name.split('/');
  if (segments.length !== 1 || name === '.' || name === '..') {
    throw failure(`RTK archive contains an unexpected nested or relative entry: ${name}`);
  }
  if (name !== target.binary && name !== RTK_LICENSE_NAME) {
    throw failure(`RTK archive contains an unexpected entry: ${name}`);
  }
  return name;
}

function capFor(name, target) {
  return name === target.binary ? RTK_MAX_BINARY_BYTES : RTK_MAX_LICENSE_BYTES;
}

function buildResult(entries, target) {
  for (const name of [target.binary, RTK_LICENSE_NAME]) {
    if (!entries.has(name)) throw failure(`RTK archive is missing ${name}`);
  }
  const binary = entries.get(target.binary);
  const license = entries.get(RTK_LICENSE_NAME);
  if (!binary.length) throw failure('RTK archive contains an empty binary');
  if (!license.length) throw failure('RTK archive contains an empty LICENSE');
  return { binaryName: target.binary, licenseName: RTK_LICENSE_NAME, binary, license };
}

function rejectedCompression(raw) {
  const signatures = [
    [[0x1f, 0x8b], 'gzip'],
    [[0x28, 0xb5, 0x2f, 0xfd], 'zstd'],
    [[0x50, 0x4b, 0x03, 0x04], 'zip'],
    [[0x42, 0x5a, 0x68], 'bzip2'],
    [[0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], 'xz'],
  ];
  for (const [bytes, name] of signatures) {
    if (bytes.every((byte, index) => raw[index] === byte)) return name;
  }
  return null;
}

function preflightTar(raw, target) {
  const nested = rejectedCompression(raw);
  if (nested) throw failure(`RTK tar archive contains nested ${nested} compression`);
  if (raw.length < 1024) throw failure('RTK tar archive is too short');
  if (raw.length % 512 !== 0) throw failure('RTK tar archive has an invalid length');

  const names = new Set();
  let offset = 0;
  let sawEof = false;
  while (offset < raw.length) {
    if (raw.length - offset < 512) throw failure('RTK tar archive has a truncated header');
    const zeroBlock = raw.subarray(offset, offset + 512).every(byte => byte === 0);
    if (zeroBlock) {
      if (offset + 1024 > raw.length) throw failure('RTK tar archive has an incomplete EOF marker');
      if (!raw.subarray(offset + 512, offset + 1024).every(byte => byte === 0)) {
        throw failure('RTK tar archive EOF marker is not followed by a second zero block');
      }
      if (!raw.subarray(offset + 1024).every(byte => byte === 0)) {
        throw failure('RTK tar archive has hidden headers or data after the first EOF marker');
      }
      sawEof = true;
      break;
    }

    let header;
    try {
      header = new Header(raw, offset);
    } catch {
      throw failure('RTK tar archive contains an invalid header');
    }
    if (!header.cksumValid) throw failure('RTK tar archive header checksum is invalid');
    if (header.typeKey !== '0') {
      if (['x', 'g', 'L', 'K', 'X'].includes(header.typeKey)) {
        throw failure(`RTK tar archive contains unsupported metadata header type ${header.typeKey}`);
      }
      throw failure(`RTK tar archive contains a non-regular entry type ${header.typeKey}`);
    }
    if (header.linkpath) throw failure('RTK tar archive contains a linked entry');
    const name = normalizeMemberName(header.path, target);
    if (names.has(name)) throw failure(`RTK tar archive contains a duplicate entry: ${name}`);
    if (names.size >= 2) throw failure('RTK tar archive contains more than two payload entries');
    if (!Number.isSafeInteger(header.size) || header.size < 0 || header.size > capFor(name, target)) {
      throw failure(`RTK tar archive entry exceeds its size limit: ${name}`);
    }
    const dataStart = offset + 512;
    const paddedSize = Math.ceil(header.size / 512) * 512;
    const next = dataStart + paddedSize;
    if (!Number.isSafeInteger(next) || next > raw.length) throw failure(`RTK tar archive entry is truncated: ${name}`);
    if (!raw.subarray(dataStart + header.size, next).every(byte => byte === 0)) {
      throw failure(`RTK tar archive entry has non-zero padding: ${name}`);
    }
    names.add(name);
    offset = next;
  }
  if (!sawEof) throw failure('RTK tar archive is missing its two-block EOF marker');
  if (names.size !== 2 || !names.has(target.binary) || !names.has(RTK_LICENSE_NAME)) {
    throw failure('RTK tar archive does not contain exactly the expected binary and LICENSE');
  }
}

function gunzipBounded(archive, maxBytes) {
  if (archive.length < 2 || archive[0] !== 0x1f || archive[1] !== 0x8b) {
    throw failure('RTK archive is not gzip-compressed');
  }
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      try { gunzip.destroy(); } catch {}
      reject(error?.code === 'RTK_ARCHIVE_INVALID' ? error : failure('RTK gzip stream is invalid or too large'));
    };
    gunzip.on('data', chunk => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        fail(failure(`RTK decompressed archive exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    gunzip.on('error', () => {
      if (settled) return;
      settled = true;
      reject(failure('RTK gzip stream is invalid'));
    });
    gunzip.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, total));
    });
    try { gunzip.end(archive); } catch { fail(failure('RTK gzip stream is invalid')); }
  });
}

async function extractTar(archive, target) {
  const raw = await gunzipBounded(archive, RTK_MAX_RAW_TAR_BYTES);
  preflightTar(raw, target);
  return new Promise((resolve, reject) => {
    const entries = new Map();
    let settled = false;
    const parser = new Parser({
      strict: true,
      gzip: false,
      brotli: false,
      zstd: false,
      maxMetaEntrySize: RTK_MAX_META_BYTES,
    });
    const fail = error => {
      if (settled) return;
      settled = true;
      try { parser.abort(error); } catch {}
      reject(error?.code === 'RTK_ARCHIVE_INVALID' ? error : failure('RTK tar archive is invalid'));
    };
    parser.on('error', fail);
    parser.on('ignoredEntry', entry => fail(failure(`RTK tar archive contains unsupported metadata or entry: ${entry?.path ?? 'unknown'}`)));
    parser.on('entry', entry => {
      if (settled) return;
      try {
        if (entry.meta) throw failure('RTK tar archive contains unexpected metadata');
        if (entry.type !== 'File') throw failure(`RTK tar archive contains a non-file entry: ${entry.path}`);
        if (entry.linkpath) throw failure(`RTK tar archive contains a linked entry: ${entry.path}`);
        const name = normalizeMemberName(entry.path, target);
        if (entries.has(name)) throw failure(`RTK tar archive contains a duplicate entry: ${name}`);
        if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > capFor(name, target)) {
          throw failure(`RTK tar archive entry exceeds its size limit: ${name}`);
        }
        if (entry.size + [...entries.values()].reduce((sum, value) => sum + value.length, 0) > RTK_MAX_RAW_TAR_BYTES) {
          throw failure('RTK tar archive expands beyond its decoded size limit');
        }
        const chunks = [];
        let total = 0;
        entry.on('data', chunk => {
          if (settled) return;
          total += chunk.length;
          if (total > entry.size || total > capFor(name, target)) {
            fail(failure(`RTK tar archive entry exceeded its declared size: ${name}`));
            return;
          }
          chunks.push(chunk);
        });
        entry.on('error', fail);
        entry.on('end', () => {
          if (settled) return;
          if (total !== entry.size) {
            fail(failure(`RTK tar archive entry is truncated: ${name}`));
            return;
          }
          entries.set(name, Buffer.concat(chunks, total));
        });
        entry.resume();
      } catch (error) {
        fail(error);
      }
    });
    parser.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolve(buildResult(entries, target)); }
      catch (error) { reject(error); }
    });
    try { parser.end(raw); } catch (error) { fail(error); }
  });
}

function zipEntryName(entry, target) {
  if (entry.generalPurposeBitFlag & 0x40) throw failure('RTK zip archive uses unsupported strong encryption');
  if (entry.isEncrypted()) throw failure('RTK zip archive contains an encrypted entry');
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw failure(`RTK zip archive uses unsupported compression method ${entry.compressionMethod}`);
  }
  if (entry.fileName.endsWith('/') || (entry.externalFileAttributes & 0x10) !== 0) {
    throw failure('RTK zip archive contains a directory entry');
  }
  const unixMode = entry.externalFileAttributes >>> 16;
  if (unixMode !== 0 && (unixMode & 0xf000) !== 0o100000) {
    throw failure('RTK zip archive contains a link or special entry');
  }
  return normalizeMemberName(entry.fileName, target);
}

function extractZip(archive, target) {
  if (archive.length < 4 || archive[0] !== 0x50 || archive[1] !== 0x4b) {
    throw failure('RTK archive is not a zip file');
  }
  return new Promise((resolve, reject) => {
    let zipfile;
    let activeStream;
    let settled = false;
    const entries = new Map();
    const fail = error => {
      if (settled) return;
      settled = true;
      try { activeStream?.destroy(); } catch {}
      try { zipfile?.close(); } catch {}
      reject(error?.code === 'RTK_ARCHIVE_INVALID' ? error : failure('RTK zip archive is invalid'));
    };
    yauzl.fromBuffer(archive, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true,
      autoClose: false,
    }, (error, opened) => {
      if (error) {
        fail(error);
        return;
      }
      zipfile = opened;
      zipfile.on('error', fail);
      zipfile.on('entry', entry => {
        if (settled) return;
        let name;
        try {
          name = zipEntryName(entry, target);
          if (entries.has(name)) throw failure(`RTK zip archive contains a duplicate entry: ${name}`);
          if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0
            || entry.uncompressedSize > capFor(name, target)) {
            throw failure(`RTK zip archive entry exceeds its size limit: ${name}`);
          }
          if (entry.compressedSize > RTK_MAX_RAW_TAR_BYTES) throw failure('RTK zip entry exceeds its compressed size limit');
          const declared = [...entries.values()].reduce((sum, value) => sum + value.length, 0) + entry.uncompressedSize;
          if (declared > RTK_MAX_RAW_TAR_BYTES) throw failure('RTK zip archive expands beyond its decoded size limit');
        } catch (validationError) {
          fail(validationError);
          return;
        }
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            fail(streamError);
            return;
          }
          activeStream = stream;
          const chunks = [];
          let total = 0;
          stream.on('data', chunk => {
            if (settled) return;
            total += chunk.length;
            if (total > entry.uncompressedSize || total > capFor(name, target)) {
              fail(failure(`RTK zip archive entry exceeded its declared size: ${name}`));
              return;
            }
            chunks.push(chunk);
          });
          stream.on('error', fail);
          stream.on('end', () => {
            if (settled) return;
            activeStream = undefined;
            if (total !== entry.uncompressedSize) {
              fail(failure(`RTK zip archive entry is truncated: ${name}`));
              return;
            }
            entries.set(name, Buffer.concat(chunks, total));
            zipfile.readEntry();
          });
        });
      });
      zipfile.on('end', () => {
        if (settled) return;
        settled = true;
        try { zipfile.close(); } catch {}
        try { resolve(buildResult(entries, target)); }
        catch (endError) { reject(endError); }
      });
      zipfile.readEntry();
    });
  });
}

export async function extractRtkArchive(archive, target) {
  if (!Buffer.isBuffer(archive) || !archive.length) throw failure('RTK archive is empty');
  if (!target || (target.format !== 'tar.gz' && target.format !== 'zip')) throw failure('Unsupported RTK archive format');
  return target.format === 'tar.gz' ? extractTar(archive, target) : extractZip(archive, target);
}
