import { storage } from 'wxt/utils/storage';
import { loadData, type CachedData } from '../src/meta';
import { TTS_DATA_MESSAGE, type TtsData } from '../src/types';

const cache = storage.defineItem<CachedData>('local:ttsData');
// Session storage survives service worker restarts, but not a browser restart.
const lastFailure = storage.defineItem<number>('session:ttsLastFailure', { fallback: 0 });

export default defineBackground(() => {
  // Content scripts cannot fetch the lists themselves: their requests count
  // as coming from twitch.tv, and the server sends no CORS headers. The
  // background script has host permission, so CORS does not apply here.
  let inFlight: Promise<TtsData | null> | null = null;

  function load(): Promise<TtsData | null> {
    inFlight ??= loadData({
      fetch: (url) =>
        fetch(url, {
          signal: AbortSignal.timeout(10_000),
          // Public data: send no cookies, follow no redirects, skip the HTTP cache.
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
        }),
      now: Date.now,
      read: async () => (await cache.getValue()) ?? undefined,
      write: (cached) => cache.setValue(cached),
      readFailure: () => lastFailure.getValue(),
      writeFailure: (at) => lastFailure.setValue(at),
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if ((message as { type?: string } | null)?.type !== TTS_DATA_MESSAGE) return;
    void load().then(sendResponse);
    // Keep the channel open for the async response.
    return true;
  });
});
