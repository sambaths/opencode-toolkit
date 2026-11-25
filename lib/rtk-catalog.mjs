// Pinned RTK OSS release catalog. Update only with reviewed upstream release
// metadata: tag, target commit, asset names, and SHA-256 digests.
export const RTK_PRODUCT = 'rtk-oss';
export const RTK_EDITION = 'OSS';
export const RTK_VERSION = '1.2.1';
export const RTK_TAG = 'v1.2.1';
export const RTK_COMMIT = 'd0f0399a5ff8cd1d81325a033f0b2d8864d665f6';
export const RTK_LICENSE = 'Apache-2.0';
export const RTK_RELEASE_BASE = 'https://github.com/rtk-ai/rtk/releases/download/v1.2.1/';
export const RTK_RELEASE_PAGE = 'https://github.com/rtk-ai/rtk/releases/tag/v1.2.1';

export const RTK_TARGETS = Object.freeze({
  'linux-x64': Object.freeze({
    platform: 'linux',
    arch: 'x64',
    format: 'tar.gz',
    archive: 'rtk-oss-x86_64-unknown-linux-musl.tar.gz',
    sha256: '44aa460c4827d206d11405c652832c9f7082edccfbc3a9f15a69a851e8a9e8b4',
    binary: 'rtk',
  }),
  'linux-arm64': Object.freeze({
    platform: 'linux',
    arch: 'arm64',
    format: 'tar.gz',
    archive: 'rtk-oss-aarch64-unknown-linux-musl.tar.gz',
    sha256: 'b01860ae2d3f44e0f7fc4431a95dd66b29b4bd87ec7f5e60aff13681b05db5dd',
    binary: 'rtk',
  }),
  'darwin-x64': Object.freeze({
    platform: 'darwin',
    arch: 'x64',
    format: 'tar.gz',
    archive: 'rtk-oss-x86_64-apple-darwin.tar.gz',
    sha256: '5e39ee8c4613c798f8d62868d4851bacca5aefcc134301052841e458ed71c797',
    binary: 'rtk',
  }),
  'darwin-arm64': Object.freeze({
    platform: 'darwin',
    arch: 'arm64',
    format: 'tar.gz',
    archive: 'rtk-oss-aarch64-apple-darwin.tar.gz',
    sha256: '5a37e5e8e016b559597024900e7b21cff7a0015aa189ac6ac80d461cbb4be65b',
    binary: 'rtk',
  }),
  'win32-x64': Object.freeze({
    platform: 'win32',
    arch: 'x64',
    format: 'zip',
    archive: 'rtk-oss-x86_64-pc-windows-msvc.zip',
    sha256: '43124168ec0733b50f7e9e1f1b994ced9b0693b9e92281428f64990c308bf1c8',
    binary: 'rtk.exe',
  }),
});

export const RTK_SUPPORTED_TARGETS = Object.freeze(Object.keys(RTK_TARGETS));

export function resolveRtkTarget(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const target = RTK_TARGETS[key];
  if (!target) {
    const error = new Error(
      `RTK OSS v${RTK_VERSION} has no reviewed binary for ${key}; supported targets: ${RTK_SUPPORTED_TARGETS.join(', ')}. `
      + 'Use --no-rtk to install the toolkit without RTK.',
    );
    error.code = 'RTK_UNSUPPORTED_TARGET';
    throw error;
  }
  return Object.freeze({ key, ...target });
}

export function rtkArchiveUrl(target) {
  if (!target || typeof target.archive !== 'string' || !/^[A-Za-z0-9._-]+$/.test(target.archive)) {
    throw new Error('Invalid pinned RTK archive name');
  }
  if (typeof target.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(target.sha256)) {
    throw new Error('Invalid pinned RTK archive digest');
  }
  const url = new URL(target.archive, RTK_RELEASE_BASE);
  const expectedPath = new URL(RTK_RELEASE_BASE).pathname + target.archive;
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.pathname !== expectedPath) {
    throw new Error('Invalid pinned RTK archive URL');
  }
  return url;
}
