import type { Hint, Suggestion } from './parser';

const MAX_ROWS = 8;

const STYLE = `
:host { all: initial; }
.box {
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  max-height: 320px;
  overflow-y: auto;
  font: 13px/1.4 Inter, Roobert, "Helvetica Neue", Arial, sans-serif;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  --fg: #efeff1; --muted: #adadb8; --bg: #18181b; --border: #3a3a3d;
  --active: #3a3a3d; --accent: #bf94ff; --warn: #ffb31a; --ok: #00f593;
}
.box.light {
  --fg: #0e0e10; --muted: #53535f; --bg: #ffffff; --border: #dedee3;
  --active: #ececf0; --accent: #772ce8; --warn: #a35b00; --ok: #00703f;
}
.row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 4px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.row.active { background: var(--active); }
.insert { font-family: ui-monospace, Consolas, monospace; color: var(--accent); }
.detail { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.kind { margin-left: auto; color: var(--muted); font-size: 11px; text-transform: uppercase; }
.hint { padding: 4px 10px; color: var(--muted); border-top: 1px solid var(--border); white-space: normal; }
.hint:first-child { border-top: 0; }
.hint.warning { color: var(--warn); }
.hint.ok { color: var(--ok); }
.more { padding: 2px 10px 4px; color: var(--muted); font-size: 11px; }
`;

function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

function hintText(hint: Hint | null): string {
  return hint ? `${hint.status}|-${hint.modifier.name}: ${hint.message}` : '';
}

export class Popup {
  private host: HTMLElement;
  private box: HTMLDivElement;
  private suggestions: Suggestion[] = [];
  private hint: Hint | null = null;
  private active = 0;
  /** True once the user moved the selection with the arrow keys. */
  private navigated = false;

  constructor(private onPick: (s: Suggestion) => void) {
    this.host = document.createElement('tts-autocomplete');
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.box = document.createElement('div');
    this.box.className = 'box';
    this.box.hidden = true;
    shadow.append(style, this.box);
    // Keep focus in the chat input when the user clicks a row.
    this.box.addEventListener('mousedown', (e) => e.preventDefault());
  }

  get visible(): boolean {
    return !this.box.hidden;
  }

  /** hide() clears the list, so a non-empty list means the popup is open. */
  get hasSuggestions(): boolean {
    return this.suggestions.length > 0;
  }

  /** Enter only accepts a suggestion after the user picked one with the arrow keys. */
  get acceptsEnter(): boolean {
    return this.hasSuggestions && this.navigated;
  }

  show(anchor: HTMLElement, suggestions: Suggestion[], hint: Hint | null): void {
    if (suggestions.length === 0 && !hint) return this.hide();
    if (!this.host.isConnected) document.documentElement.append(this.host);

    // Read layout before any DOM writes, so the browser lays out the page once.
    const rect = anchor.getBoundingClientRect();

    const sameList =
      suggestions.length === this.suggestions.length &&
      suggestions.every((s, i) => s.insert === this.suggestions[i]?.insert);
    const changed = !this.visible || !sameList || hintText(hint) !== hintText(this.hint);
    if (!sameList) {
      this.active = 0;
      this.navigated = false;
    }
    this.suggestions = suggestions;
    this.hint = hint;
    if (changed) this.render();
    this.place(rect);
    this.box.hidden = false;
  }

  /** Removes the popup from the page for good. */
  destroy(): void {
    this.hide();
    this.host.remove();
  }

  hide(): void {
    this.box.hidden = true;
    this.suggestions = [];
    this.hint = null;
    this.navigated = false;
  }

  move(delta: number): void {
    const n = this.suggestions.length;
    if (n === 0) return;
    this.active = (this.active + delta + n) % n;
    this.navigated = true;
    this.render();
  }

  pick(): void {
    const s = this.suggestions[this.active];
    if (s) this.onPick(s);
  }

  private render(): void {
    this.box.replaceChildren();
    this.box.classList.toggle('light', document.documentElement.classList.contains('tw-root--theme-light'));

    // Show a window of MAX_ROWS rows that always contains the active row.
    const start = Math.max(0, Math.min(this.active - MAX_ROWS + 1, this.suggestions.length - MAX_ROWS));
    this.suggestions.slice(start, start + MAX_ROWS).forEach((s, i) => {
      const row = document.createElement('div');
      row.className = start + i === this.active ? 'row active' : 'row';
      row.append(span('insert', s.insert));
      if (s.detail) row.append(span('detail', s.detail));
      row.append(span('kind', s.kind));
      row.addEventListener('click', () => this.onPick(s));
      this.box.append(row);
    });

    if (this.suggestions.length > MAX_ROWS) {
      const more = document.createElement('div');
      more.className = 'more';
      more.textContent = `${this.active + 1} of ${this.suggestions.length}. Tab to accept.`;
      this.box.append(more);
    }

    if (this.hint) {
      const el = document.createElement('div');
      el.className = `hint ${this.hint.status}`;
      el.textContent = `-${this.hint.modifier.name}: ${this.hint.message}`;
      this.box.append(el);
    }
  }

  private place(rect: DOMRect): void {
    const width = Math.max(rect.width, 300);
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - width - 4));
    this.box.style.left = `${left}px`;
    this.box.style.width = `${width}px`;
    this.box.style.bottom = `${window.innerHeight - rect.top + 6}px`;
  }
}
