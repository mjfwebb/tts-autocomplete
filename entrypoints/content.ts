import { startAutocomplete } from '../src/app';
import { TTS_DATA_MESSAGE } from '../src/types';

export default defineContentScript({
  matches: ['https://*.twitch.tv/*'],
  allFrames: true,
  // Register the capture-phase key handler as early as possible, so it sees
  // Tab before the emote completion of Twitch, BTTV, FFZ and 7TV.
  runAt: 'document_start',
  // WXT would otherwise post a startup message with the extension ID to the page.
  // The same-world event that stops old copies of the script still works.
  noScriptStartedPostMessage: true,
  main(ctx) {
    startAutocomplete({
      // The background script fetches the lists. See entrypoints/background.ts.
      requestData: () => browser.runtime.sendMessage({ type: TTS_DATA_MESSAGE }),
      // ctx.signal removes every listener when this copy of the script goes stale.
      listen: (target, type, handler, options) =>
        target.addEventListener(type, handler, { ...options, signal: ctx.signal }),
      // ctx only notices a stale script when something reads ctx.isInvalid.
      isInvalid: () => ctx.isInvalid,
      onInvalidated: (callback) => ctx.onInvalidated(callback),
    });
  },
});
