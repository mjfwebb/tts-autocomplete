// The autocomplete for the Twitch chat box. The browser extension and the
// userscript both run this; each passes in a Host for the parts that differ.

import { findEditable, readState, replaceRange, type Editable } from './editor';
import { shouldRequest } from './meta';
import { getCompletions, type Suggestion } from './parser';
import { Popup } from './popup';
import { EMPTY_DATA, isTtsData, type TtsData } from './types';

export interface Host {
  /** Gets the voice and sound lists. The result is checked before use. */
  requestData: () => Promise<unknown>;
  /** Adds an event listener that the host removes when this copy of the script stops. */
  listen: (
    target: EventTarget,
    type: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions,
  ) => void;
  /** True once this copy of the script is stale, for example after an extension update. */
  isInvalid: () => boolean;
  /** Runs `callback` when this copy of the script becomes stale. */
  onInvalidated: (callback: () => void) => void;
}

function swallow(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopImmediatePropagation();
}

export function startAutocomplete(host: Host): void {
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
  // A stale copy of the script removes its popup. The host removes its listeners.
  // Timers use the native functions, because each WXT ctx timer call adds an
  // abort listener that WXT never removes.
  host.onInvalidated(() => popup.destroy());

  function requestData(): void {
    if (requesting || host.isInvalid()) return;
    requesting = true;
    lastRequest = Date.now();
    host
      .requestData()
      .then((response) => {
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
    if (host.isInvalid()) return;
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

  host.listen(
    window,
    'keydown',
    (event) => {
      const e = event as KeyboardEvent;
      if (host.isInvalid() || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
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

  host.listen(document, 'input', schedule, { capture: true });
  host.listen(document, 'selectionchange', schedule);
  host.listen(document, 'focusin', schedule, { capture: true });
  host.listen(document, 'focusout', () => setTimeout(schedule), { capture: true });
  host.listen(window, 'resize', schedule);
}
