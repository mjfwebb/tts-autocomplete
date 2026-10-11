// Entry point of the userscript version. The build script adds the
// ==UserScript== header. See scripts/build-userscript.ts.

import { startAutocomplete } from '../src/app';
import { loadData, type CachedData } from '../src/meta';
import { createGmFetch } from './gm-fetch';

const CACHE_KEY = 'ttsData';
const FAILURE_KEY = 'ttsLastFailure';

startAutocomplete({
  // The same cache and limits as the extension, with the manager's storage and requests.
  requestData: () =>
    loadData({
      fetch: createGmFetch(GM),
      now: Date.now,
      read: async () => (await GM.getValue(CACHE_KEY)) as CachedData | undefined,
      write: (cached) => GM.setValue(CACHE_KEY, cached),
      readFailure: async () => Number(await GM.getValue(FAILURE_KEY, 0)) || 0,
      writeFailure: (at) => GM.setValue(FAILURE_KEY, at),
    }),
  listen: (target, type, handler, options) => target.addEventListener(type, handler, options),
  // A userscript copy never goes stale while the page is open.
  isInvalid: () => false,
  onInvalidated: () => {},
});
