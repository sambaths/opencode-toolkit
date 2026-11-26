import { createHash } from 'node:crypto';
import { TOOLKIT_VERSION } from './install.mjs';
import { RTK_TAG, rtkArchiveUrl } from './rtk-catalog.mjs';

export const RTK_MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
export const RTK_MAX_REDIRECTS = 5;
export const RTK_DOWNLOAD_TIMEOUT_MS = 60_000;
export const RTK_REDIRECT_HOSTS = Object.freeze(['github.com', 'release-assets.githubusercontent.com']);

const failure = message => {
  const error = new Error(message);
  error.code = 'RTK_DOWNLOAD_FAILED';
  return error;
};

function redirectTarget(location, current) {
  if (typeof location !== 'string' || !location) throw failure('RTK download returned a redirect without a location');
  let next;
  try {
    next = new URL(location, current);
  } catch {
    throw failure('RTK download returned an invalid redirect');
  }
  if (next.protocol !== 'https:') throw failure('RTK download redirect must use HTTPS');
  if (next.username || next.password) throw failure('RTK download redirect included credentials');
  if (!RTK_REDIRECT_HOSTS.includes(next.hostname)) {
    throw failure(`RTK download redirected to an unexpected host: ${next.hostname}`);
  }
  if (next.port && next.port !== '443') throw failure('RTK download redirect used an unexpected port');
  return next;
}

async function readBoundedBody(response, maxBytes, onReader) {
  const declared = response.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined) {
    if (!/^\d+$/.test(declared)) throw failure('RTK download returned an invalid content length');
    if (Number(declared) > maxBytes) throw failure(`RTK archive exceeds the ${maxBytes}-byte download limit`);
  }
  if (!response.body) {
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maxBytes) throw failure(`RTK archive exceeds the ${maxBytes}-byte download limit`);
    return data;
  }
  const reader = response.body.getReader();
  onReader(reader);
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) throw failure(`RTK archive exceeds the ${maxBytes}-byte download limit`);
      chunks.push(chunk);
    }
  } finally {
    onReader(null);
    try { reader.releaseLock?.(); } catch {}
  }
  return Buffer.concat(chunks, total);
}

function boundedCleanup(promise, milliseconds = 1000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    timer.unref?.();
    Promise.resolve(promise).then(finish, finish);
  });
}

async function cancelResponseBody(response) {
  if (!response?.body) return;
  try { await boundedCleanup(response.body.cancel()); } catch {}
}

export async function downloadRtkArchive({
  target,
  fetchImpl = globalThis.fetch,
  timeoutMs = RTK_DOWNLOAD_TIMEOUT_MS,
  maxBytes = RTK_MAX_DOWNLOAD_BYTES,
  maxRedirects = RTK_MAX_REDIRECTS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw failure('RTK download requires a fetch implementation');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw failure('Invalid RTK download timeout');
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) throw failure('Invalid RTK download size limit');
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) throw failure('Invalid RTK redirect limit');

  let current = rtkArchiveUrl(target);
  const controller = new AbortController();
  let timedOut = false;
  let activeResponse;
  let activeReader;
  const disposeTransport = async () => {
    controller.abort();
    const reader = activeReader;
    const response = activeResponse;
    activeReader = undefined;
    activeResponse = undefined;
    if (reader) {
      try { await boundedCleanup(reader.cancel()); } catch {}
      try { reader.releaseLock?.(); } catch {}
    } else if (response?.body) {
      await cancelResponseBody(response);
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timer.unref?.();

  try {
    let response;
    for (let redirects = 0; ; redirects++) {
      response = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          'user-agent': `opencode-toolkit-rtk-installer/${TOOLKIT_VERSION}`,
          accept: 'application/octet-stream',
        },
      });
      if (!response || typeof response.status !== 'number') throw failure('RTK download returned an invalid response');
      activeResponse = response;
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects >= maxRedirects) throw failure(`RTK download exceeded ${maxRedirects} redirects`);
        let location = null;
        try { location = response.headers?.get?.('location') ?? null; } catch {}
        await cancelResponseBody(response);
        activeResponse = undefined;
        current = redirectTarget(location, current);
        continue;
      }
      break;
    }

    if (response.status !== 200) throw failure(`RTK download failed with HTTP ${response.status}`);
    const archive = await readBoundedBody(response, maxBytes, reader => {
      activeReader = reader ?? undefined;
    });
    activeResponse = undefined;
    activeReader = undefined;
    const actual = createHash('sha256').update(archive).digest('hex');
    if (actual !== target.sha256) {
      throw failure(`RTK archive checksum mismatch: expected ${target.sha256}, received ${actual}`);
    }
    return { archive, sha256: actual, tag: RTK_TAG };
  } catch (error) {
    const timedOutBeforeDispose = timedOut;
    await disposeTransport();
    if (timedOutBeforeDispose) throw failure(`RTK download timed out after ${Math.ceil(timeoutMs / 1000)} seconds`);
    if (error?.code === 'RTK_DOWNLOAD_FAILED') throw error;
    const code = error?.cause?.code ?? error?.code;
    throw failure(`RTK download failed${typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? ` (${code})` : ''}`);
  } finally {
    clearTimeout(timer);
  }
}
