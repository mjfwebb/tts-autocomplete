// Reads and edits the chat input without knowing which chat box it is.
// Works with Twitch's Slate editor (contenteditable) and plain textareas.
//
// Editors with their own model (Slate) only update it from `beforeinput`, and
// execCommand does not fire `beforeinput`. So for contenteditable we first
// dispatch a synthetic `beforeinput`. An editor that handles it cancels it.
// If nothing cancels it, we fall back to execCommand.

export type Editable = HTMLTextAreaElement | HTMLInputElement | HTMLElement;

export interface EditorState {
  text: string;
  cursor: number;
}

/** Slate fills empty text nodes with this zero-width character. */
const ZERO_WIDTH = '\uFEFF';

/** The editable element for an event target or the focused element, if any. */
export function findEditable(node: EventTarget | null): Editable | null {
  if (node instanceof HTMLTextAreaElement) return node;
  if (node instanceof HTMLInputElement && (node.type === 'text' || node.type === 'search')) return node;
  if (node instanceof HTMLElement && node.isContentEditable) {
    // Climb to the editing host so offsets are counted from the start of the message.
    let host: HTMLElement = node;
    while (host.parentElement?.isContentEditable) host = host.parentElement;
    return host;
  }
  return null;
}

function isTextControl(el: Editable): el is HTMLTextAreaElement | HTMLInputElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

function normalize(text: string): string {
  return text.replaceAll(ZERO_WIDTH, '').replaceAll('\u00A0', ' ');
}

/** Current text and caret offset, or null when the caret is not in the element. */
export function readState(el: Editable): EditorState | null {
  if (isTextControl(el)) {
    if (el.selectionStart === null) return null;
    return { text: normalize(el.value), cursor: normalize(el.value.slice(0, el.selectionStart)).length };
  }

  const sel = el.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.focusNode || !el.contains(sel.focusNode)) return null;

  const before = el.ownerDocument.createRange();
  before.selectNodeContents(el);
  before.setEnd(sel.focusNode, sel.focusOffset);
  return { text: normalize(el.textContent ?? ''), cursor: normalize(before.toString()).length };
}

/** Index in `value` of the visible character offset `n`, skipping zero-width characters. */
function rawOffset(value: string, n: number): number {
  let seen = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === ZERO_WIDTH) continue;
    if (seen === n) return i;
    seen++;
  }
  return value.length;
}

/** DOM position of the visible character offset `n`, skipping zero-width characters. */
function pointAt(root: HTMLElement, n: number): { node: Node; offset: number } {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const data = node.data;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === ZERO_WIDTH) continue;
      if (seen === n) return { node, offset: i };
      seen++;
    }
    last = node;
  }
  if (last) return { node: last, offset: last.data.length };
  return { node: root, offset: root.childNodes.length };
}

/** Resolves once the browser has dispatched `selectionchange` and its listeners ran. */
function selectionSettled(doc: Document): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      doc.removeEventListener('selectionchange', done);
      // Let the editor's own selectionchange listener run first.
      setTimeout(resolve, 0);
    };
    const timer = setTimeout(done, 100);
    doc.addEventListener('selectionchange', done);
  });
}

function sameSelection(sel: Selection, a: { node: Node; offset: number }, b: { node: Node; offset: number }): boolean {
  return (
    sel.anchorNode === a.node &&
    sel.anchorOffset === a.offset &&
    sel.focusNode === b.node &&
    sel.focusOffset === b.offset
  );
}

/** Replaces the visible characters [start, end) with `text` and leaves the caret after it. */
export async function replaceRange(el: Editable, start: number, end: number, text: string): Promise<void> {
  el.focus();
  if (isTextControl(el)) {
    el.setSelectionRange(rawOffset(el.value, start), rawOffset(el.value, end));
  } else {
    const doc = el.ownerDocument;
    const sel = doc.getSelection();
    if (!sel) return;
    const a = pointAt(el, start);
    const b = pointAt(el, end);
    if (!sameSelection(sel, a, b)) {
      // The browser fires selectionchange later, as a separate task. Slate only
      // learns about the new selection then, so wait for it before inserting.
      const settled = selectionSettled(doc);
      sel.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
      await settled;
    }

    const event = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: text,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    if (!el.dispatchEvent(event)) return;
  }
  // Deprecated but still the only way to insert text that every editor
  // treats as user input. Supported in Chrome and Firefox.
  el.ownerDocument.execCommand('insertText', false, text);
}
