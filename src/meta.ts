import { MAX_RESPONSE_BYTES, cleanTtsData, type TtsData } from './types';

export const META_URL = 'https://nice.gg/meta';
/** Refetch the lists once they are older than this. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** A content script without lists asks again after this long. */
export const RETRY_MS = 60 * 1000;
/** A content script with lists asks again after this long, to pick up the daily refresh. */
export const REFRESH_MS = 6 * 60 * 60 * 1000;
/** After a failed download, wait this long before trying again. */
export const FAILURE_PAUSE_MS = 5 * 60 * 1000;

export interface CachedData {
  data: TtsData;
  fetchedAt: number;
}

export interface MetaDeps {
  fetch: (url: string) => Promise<Response>;
  now: () => number;
  read: () => Promise<CachedData | undefined>;
  write: (cached: CachedData) => Promise<void>;
  /**
   * Time of the last failed download, 0 if none. It must survive a restart of
   * the background script: Chrome stops an idle service worker after about 30 s.
   */
  readFailure: () => Promise<number>;
  writeFailure: (at: number) => Promise<void>;
}

/** Reads the body as text, and stops as soon as it is larger than `maxBytes`. */
export async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) throw new Error('Response too large');
  if (!response.body) return '';

  // Count the decoded bytes as they arrive. Content-Length can be missing, wrong,
  // or count compressed bytes, so it cannot be the only check.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Response too large');
    }
    chunks.push(value);
  }
  const decoder = new TextDecoder();
  return chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
}

/** The cached copy, re-checked like a fresh download. Data saved by an older build is checked too. */
async function readCache(deps: MetaDeps): Promise<CachedData | undefined> {
  const cached = await deps.read().catch(() => undefined);
  const data = cached && cleanTtsData(cached.data);
  return cached && data ? { data, fetchedAt: cached.fetchedAt } : undefined;
}

/**
 * The voice and sound lists. Uses the cached copy while it is fresh, fetches
 * a new one when it is stale, and falls back to the stale copy if the fetch
 * fails. Null only when nothing was ever fetched.
 */
export async function loadData(deps: MetaDeps): Promise<TtsData | null> {
  const cached = await readCache(deps);
  const now = deps.now();
  // A negative age means the clock was ahead when the lists were saved. Treat it as stale.
  const age = cached ? now - cached.fetchedAt : -1;
  if (cached && age >= 0 && age < MAX_AGE_MS) return cached.data;

  // Many tabs and frames ask at once. After a failure, do not hammer the server.
  // A negative time since the failure means the clock moved back. The pause is then over.
  const sinceFailure = now - (await deps.readFailure().catch(() => 0));
  if (sinceFailure >= 0 && sinceFailure < FAILURE_PAUSE_MS) return cached?.data ?? null;

  let data: TtsData;
  try {
    const response = await deps.fetch(META_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const clean = cleanTtsData(JSON.parse(await readLimited(response, MAX_RESPONSE_BYTES)));
    if (!clean) throw new Error('Unexpected response shape');
    data = clean;
  } catch (error) {
    await deps.writeFailure(deps.now()).catch(() => {});
    console.warn('[tts-autocomplete] Could not fetch voice and sound names:', error);
    return cached?.data ?? null;
  }

  // A failed save only means the next load fetches again. Keep the fresh lists.
  try {
    await deps.write({ data, fetchedAt: deps.now() });
  } catch (error) {
    console.warn('[tts-autocomplete] Could not cache voice and sound names:', error);
  }
  return data;
}

/** True when a content script should ask the background script for the lists again. */
export function shouldRequest(hasData: boolean, lastRequest: number, now: number): boolean {
  return now - lastRequest >= (hasData ? REFRESH_MS : RETRY_MS);
}
