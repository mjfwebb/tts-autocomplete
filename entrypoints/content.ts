import { findEditable, readState, replaceRange, type Editable } from '../src/editor';
import { getCompletions, type Suggestion } from '../src/parser';
import { shouldRequest } from '../src/meta';
import { Popup } from '../src/popup';
import { EMPTY_DATA, TTS_DATA_MESSAGE, isTtsData, type TtsData } from '../src/types';

function swallow(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopImmediatePropagation();
}

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
    let editable: Editable | null = null;
    /** Text at the time the user pressed Escape. The popup stays closed until it changes. */
    let dismissedText: string | null = null;
    let frame = 0;
    let inserting = false;
    // Modifiers work right away. Voices and sounds appear once the background
    // script answers with the lists.
    let data: TtsData = EMPTY_DATA;
    let lastRequest = 0;
    let requesting = false;

    const popup = new Popup(accept);
    // After an extension update or reload, this copy of the script is stale.
    // ctx only notices when something reads ctx.isInvalid, so the key handler
    // and update() check it. ctx then removes the event listeners, and this
    // removes the popup. Timers use the native functions, because each ctx
    // timer call adds an abort listener that WXT never removes.
    ctx.onInvalidated(() => popup.destroy());

    function requestData(): void {
      if (requesting || ctx.isInvalid) return;
      requesting = true;
      lastRequest = Date.now();
      browser.runtime
        .sendMessage({ type: TTS_DATA_MESSAGE })
        .then((response: unknown) => {
          if (!isTtsData(response)) return;
          data = response;
          // Show the new voices and sounds in a popup that is already open.
          schedule();
        })
        .catch(() => {})
        .finally(() => {
          requesting = false;
        });
    }

    requestData();

    function update(): void {
      frame = 0;
      if (ctx.isInvalid) return;
      editable = findEditable(document.activeElement);
      const state = editable && readState(editable);
      const result = state && getCompletions(state.text, state.cursor, data);
      if (state && dismissedText !== null && state.text !== dismissedText) dismissedText = null;
      // Retry a failed load, or pick up the daily refresh, while the user types a !tts message.
      if (result && shouldRequest(data !== EMPTY_DATA, lastRequest, Date.now())) requestData();
      if (!editable || !result || dismissedText !== null || inserting) return popup.hide();
      popup.show(editable, result.suggestions, result.hint);
    }

    function schedule(): void {
      if (!frame) frame = requestAnimationFrame(update);
    }

    async function accept(s: Suggestion): Promise<void> {
      const state = editable && readState(editable);
      const result = state && getCompletions(state.text, state.cursor, data);
      if (inserting || !editable || !state || !result) return;
      const space = s.complete && state.text[result.tokenEnd] !== ' ' ? ' ' : '';
      inserting = true;
      popup.hide();
      try {
        await replaceRange(editable, result.tokenStart, result.tokenEnd, s.insert + space);
      } finally {
        inserting = false;
        schedule();
      }
    }

    ctx.addEventListener(
      window,
      'keydown',
      (e) => {
        if (ctx.isInvalid || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
        if (!['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(e.key)) return;
        // A fast typist can press Tab before the scheduled frame updates the
        // popup, and Slate does not fire `input` for every character. Refresh
        // now so the decision uses the current text.
        if (frame) cancelAnimationFrame(frame);
        update();
        if (!popup.visible) return;
        if (e.key === 'ArrowDown' && popup.hasSuggestions) {
          popup.move(1);
          swallow(e);
        } else if (e.key === 'ArrowUp' && popup.hasSuggestions) {
          popup.move(-1);
          swallow(e);
        } else if (e.key === 'Tab' && !e.shiftKey && popup.hasSuggestions) {
          popup.pick();
          swallow(e);
        } else if (e.key === 'Enter' && popup.acceptsEnter) {
          popup.pick();
          swallow(e);
        } else if (e.key === 'Escape') {
          dismissedText = (editable && readState(editable)?.text) ?? '';
          popup.hide();
          swallow(e);
        }
      },
      { capture: true },
    );

    ctx.addEventListener(document, 'input', schedule, { capture: true });
    ctx.addEventListener(document, 'selectionchange', schedule);
    ctx.addEventListener(document, 'focusin', schedule, { capture: true });
    ctx.addEventListener(document, 'focusout', () => setTimeout(schedule), { capture: true });
    ctx.addEventListener(window, 'resize', schedule);
  },
});
