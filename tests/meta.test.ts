import { describe, expect, it, vi } from 'vitest';
import {
  FAILURE_PAUSE_MS,
  MAX_AGE_MS,
  META_URL,
  REFRESH_MS,
  RETRY_MS,
  loadData,
  readLimited,
  shouldRequest,
  type CachedData,
  type MetaDeps,
} from '../src/meta';
import { MAX_RESPONSE_BYTES, cleanTtsData, isTtsData } from '../src/types';

const OLD = { voices: ['old'], sounds: ['yay'] };
const NEW = { voices: ['old', 'c3'], sounds: ['yay', 'yeet'] };
const NOW = 1_000_000_000;

function deps(
  cached: CachedData | undefined,
  respond: () => Promise<Response>,
): MetaDeps & { written: CachedData[]; failure: { at: number } } {
  const written: CachedData[] = [];
  const failure = { at: 0 };
  return {
    written,
    failure,
    fetch: vi.fn<MetaDeps['fetch']>(respond),
    now: () => NOW,
    read: async () => cached,
    write: async (c) => {
      written.push(c);
    },
    readFailure: async () => failure.at,
    writeFailure: async (at) => {
      failure.at = at;
    },
  };
}

const json =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status });

describe('loadData', () => {
  it('uses a fresh cache without fetching', async () => {
    const d = deps({ data: OLD, fetchedAt: NOW - MAX_AGE_MS + 1 }, json(NEW));
    expect(await loadData(d)).toEqual(OLD);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('fetches and stores new lists when the cache is stale', async () => {
    const d = deps({ data: OLD, fetchedAt: NOW - MAX_AGE_MS }, json(NEW));
    expect(await loadData(d)).toEqual(NEW);
    expect(d.fetch).toHaveBeenCalledWith(META_URL);
    expect(d.written).toEqual([{ data: NEW, fetchedAt: NOW }]);
  });

  it('treats a cache from the future as stale', async () => {
    const d = deps({ data: OLD, fetchedAt: NOW + 1000 }, json(NEW));
    expect(await loadData(d)).toEqual(NEW);
  });

  it('fetches when the cache cannot be read', async () => {
    const d = deps(undefined, json(NEW));
    d.read = () => Promise.reject(new Error('storage unavailable'));
    expect(await loadData(d)).toEqual(NEW);
  });

  it('fetches on first use', async () => {
    const d = deps(undefined, json(NEW));
    expect(await loadData(d)).toEqual(NEW);
  });

  it('returns fresh lists even when saving them fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = deps({ data: OLD, fetchedAt: 0 }, json(NEW));
    d.write = () => Promise.reject(new Error('quota exceeded'));
    expect(await loadData(d)).toEqual(NEW);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('drops invalid names from the response', async () => {
    const voices = ['old', 'bad voice', 'x\nspam'];
    const sounds = ['yay', 'a\u202Eb', ''];
    expect(await loadData(deps(undefined, json({ voices, sounds })))).toEqual({ voices: ['old'], sounds: ['yay'] });
  });

  it('rejects a response that is too large', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const huge = new Response(' '.repeat(MAX_RESPONSE_BYTES + 1));
    expect(await loadData(deps({ data: OLD, fetchedAt: 0 }, async () => huge))).toEqual(OLD);
    warn.mockRestore();
  });

  it('pauses after a failed download', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = deps({ data: OLD, fetchedAt: 0 }, json({}, 500));
    expect(await loadData(d)).toEqual(OLD);
    expect(d.failure.at).toBe(NOW);
    expect(await loadData(d)).toEqual(OLD);
    expect(d.fetch).toHaveBeenCalledOnce();
    d.failure.at = NOW - FAILURE_PAUSE_MS;
    await loadData(d);
    expect(d.fetch).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('ends the pause when the clock moved back', async () => {
    const d = deps(undefined, json(NEW));
    d.failure.at = NOW + 60_000;
    expect(await loadData(d)).toEqual(NEW);
  });

  it('re-checks cached data like a fresh download', async () => {
    // Data saved by an older build: voices as objects. It is ignored and fetched again.
    const old = { data: { voices: [{ name: 'old' }], sounds: [] }, fetchedAt: NOW } as unknown as CachedData;
    expect(await loadData(deps(old, json(NEW)))).toEqual(NEW);
    // Invalid names in a fresh cache are dropped.
    const dirty = { data: { voices: ['old', 'bad voice'], sounds: ['yay'] }, fetchedAt: NOW };
    expect(await loadData(deps(dirty, json(NEW)))).toEqual({ voices: ['old'], sounds: ['yay'] });
  });

  it('falls back to the stale cache when the fetch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = { data: OLD, fetchedAt: 0 };
    expect(await loadData(deps(stale, json({}, 500)))).toEqual(OLD);
    expect(await loadData(deps(stale, () => Promise.reject(new Error('offline'))))).toEqual(OLD);
    expect(await loadData(deps(stale, json({ voices: 'nope' })))).toEqual(OLD);
    expect(await loadData(deps(undefined, json({}, 500)))).toBeNull();
    warn.mockRestore();
  });
});

describe('isTtsData', () => {
  it('accepts two lists of names and rejects anything else', () => {
    expect(isTtsData(NEW)).toBe(true);
    expect(isTtsData({ voices: [], sounds: [] })).toBe(true);
    expect(isTtsData(null)).toBe(false);
    expect(isTtsData({ voices: ['a'] })).toBe(false);
    expect(isTtsData({ voices: [{ name: 'a' }], sounds: [] })).toBe(false);
  });
});

describe('shouldRequest', () => {
  it('retries quickly without lists and refreshes slowly with them', () => {
    expect(shouldRequest(false, NOW - RETRY_MS + 1, NOW)).toBe(false);
    expect(shouldRequest(false, NOW - RETRY_MS, NOW)).toBe(true);
    expect(shouldRequest(true, NOW - RETRY_MS, NOW)).toBe(false);
    expect(shouldRequest(true, NOW - REFRESH_MS, NOW)).toBe(true);
  });
});

describe('cleanTtsData', () => {
  it('rejects lists that are too long', () => {
    expect(cleanTtsData({ voices: Array(5_001).fill('a'), sounds: [] })).toBeNull();
    expect(cleanTtsData({ voices: [], sounds: Array(20_001).fill('a') })).toBeNull();
    expect(cleanTtsData({ voices: ['a'.repeat(65), 'a'.repeat(64)], sounds: [] })).toEqual({
      voices: ['a'.repeat(64)],
      sounds: [],
    });
  });
});

/** A response whose body arrives in chunks and has no Content-Length header. */
function streamed(chunks: number, chunkBytes: number, headers: Record<string, string> = {}): Response {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ < chunks) controller.enqueue(new Uint8Array(chunkBytes).fill(32));
      else controller.close();
    },
  });
  return new Response(body, { headers });
}

describe('readLimited', () => {
  it('reads a body within the limit', async () => {
    expect(await readLimited(streamed(3, 10), 100)).toBe(' '.repeat(30));
  });

  it('stops a body without Content-Length once it passes the limit', async () => {
    await expect(readLimited(streamed(1000, 1000), 10_000)).rejects.toThrow('Response too large');
  });

  it('does not trust a Content-Length that is too small', async () => {
    await expect(readLimited(streamed(5, 100, { 'content-length': '10' }), 200)).rejects.toThrow('Response too large');
  });

  it('rejects early when Content-Length is too large', async () => {
    await expect(readLimited(streamed(1, 1, { 'content-length': '999999' }), 100)).rejects.toThrow(
      'Response too large',
    );
  });
});
