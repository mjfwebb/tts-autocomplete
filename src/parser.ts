import { MODIFIERS, argIsComplete, argIsPartial, argNumbers, matchModifier, type Modifier } from './modifiers';
import type { TtsData } from './types';

const COMMAND = /^!tts( |$)/i;
const RANDOM_VOICE = 'randomvoice:';
const RANDOM_SOUND = 'random';
/** Sound names need this many characters after the dash before substring matches appear. */
const SUBSTRING_MIN = 2;

/** Modifiers that take a sound name as their argument, such as -up. */
const SOUND_ARG_MODIFIERS = MODIFIERS.filter((m) => m.arg === 'sound');

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export interface Suggestion {
  kind: 'modifier' | 'sound' | 'voice';
  /** Text that replaces the token under the cursor. */
  insert: string;
  /** True when the inserted token needs no more typing, so the UI can add a space. */
  complete: boolean;
  detail?: string;
}

export interface Hint {
  modifier: Modifier;
  status: 'incomplete' | 'ok' | 'warning';
  message: string;
}

export interface CompletionResult {
  /** Start and end of the whole token under the cursor in the input text. */
  tokenStart: number;
  tokenEnd: number;
  suggestions: Suggestion[];
  hint: Hint | null;
}

interface Index {
  soundSet: Set<string>;
  /** Every sound, sorted. -up and -down can play all of them, e.g. -upb for a sound named "b". */
  sounds: string[];
  /** Sounds playable as -<name>, sorted. Sounds hidden by a modifier pattern, such as "b" (-b), are left out. */
  playableSounds: string[];
  /** Voice names with case-insensitive duplicates removed. */
  voices: string[];
}

const indexCache = new WeakMap<TtsData, Index>();

function buildIndex(data: TtsData): Index {
  const cached = indexCache.get(data);
  if (cached) return cached;

  // The server compares voices case-insensitively and the last match wins.
  const voiceByLower = new Map<string, string>();
  for (const v of data.voices) voiceByLower.set(v.toLowerCase(), v);

  const sounds = data.sounds.toSorted(collator.compare);
  const index: Index = {
    soundSet: new Set(data.sounds),
    sounds,
    playableSounds: sounds.filter((s) => !matchModifier(`-${s}`)),
    voices: [...voiceByLower.values()].toSorted(collator.compare),
  };
  indexCache.set(data, index);
  return index;
}

function modifierDetail(m: Modifier): string {
  return m.argHint ? `${m.description} (${m.argHint})` : m.description;
}

function dashSuggestions(index: Index, prefix: string): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (s: Suggestion) => {
    if (seen.has(s.insert)) return;
    seen.add(s.insert);
    out.push(s);
  };

  const modifiers = MODIFIERS.filter((m) => `-${m.name}`.startsWith(prefix)).toSorted(
    (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name),
  );
  for (const m of modifiers) {
    // Complete when the modifier is valid with no value, such as -b, or -lfo with its optional value.
    add({ kind: 'modifier', insert: `-${m.name}`, complete: argIsComplete(m, ''), detail: modifierDetail(m) });
  }

  for (const m of SOUND_ARG_MODIFIERS) {
    if (!prefix.startsWith(`-${m.name}`)) continue;
    const rest = prefix.slice(m.name.length + 1);
    for (const s of index.sounds) {
      if (s.startsWith(rest)) add({ kind: 'sound', insert: `-${m.name}${s}`, complete: true });
    }
  }

  const query = prefix.slice(1).toLowerCase();
  if (RANDOM_SOUND.startsWith(query)) {
    add({ kind: 'sound', insert: `-${RANDOM_SOUND}`, complete: true, detail: 'A random sound.' });
  }
  for (const s of index.playableSounds) {
    if (s.toLowerCase().startsWith(query)) add({ kind: 'sound', insert: `-${s}`, complete: true });
  }
  if (query.length >= SUBSTRING_MIN) {
    for (const s of index.playableSounds) {
      if (s.toLowerCase().includes(query)) add({ kind: 'sound', insert: `-${s}`, complete: true });
    }
  }
  return out;
}

function voiceSuggestions(index: Index, prefix: string): Suggestion[] {
  if (prefix.endsWith(':')) return [];
  const query = prefix.toLowerCase();
  const out: Suggestion[] = [];
  if (RANDOM_VOICE.startsWith(query)) {
    out.push({ kind: 'voice', insert: RANDOM_VOICE, complete: true, detail: 'Every word uses a different voice.' });
  }
  for (const v of index.voices) {
    if (v.toLowerCase().startsWith(query)) out.push({ kind: 'voice', insert: `${v}:`, complete: true });
  }
  return out;
}

/** True when appending digits to `n` can give a number in [min, max]. */
function couldGrowInto(n: number | undefined, min: number, max: number): boolean {
  if (n === undefined || n < 0 || n >= min) return false;
  for (let scale = 10; n * scale <= max; scale *= 10) {
    if (n * scale + scale - 1 >= min) return true;
  }
  return false;
}

/** Argument hint for a modifier the user is typing, e.g. "-r1" or "-c500:". */
export function getHint(token: string, data: TtsData): Hint | null {
  if (!token.startsWith('-')) return null;
  const index = buildIndex(data);
  // A whole sound name gets no hint, unless a modifier pattern claims the word first.
  if (!matchModifier(token) && (index.soundSet.has(token.slice(1)) || token === `-${RANDOM_SOUND}`)) return null;

  // Longest modifier name whose argument is still a valid prefix: "-rc5" is -rc, not -r.
  const candidates = MODIFIERS.filter((m) => token.startsWith(`-${m.name}`)).toSorted(
    (a, b) => b.name.length - a.name.length,
  );

  for (const m of candidates) {
    const arg = token.slice(m.name.length + 1);
    if (!argIsPartial(m, arg)) continue;

    const hint = (status: Hint['status'], message = m.argHint ?? m.description): Hint => ({
      modifier: m,
      status,
      message,
    });
    if (!argIsComplete(m, arg)) return hint('incomplete');
    if (m.arg === 'sound' && !index.soundSet.has(arg)) {
      if (index.sounds.some((s) => s.startsWith(arg))) return hint('incomplete');
      return hint('warning', `Unknown sound "${arg}". The server ignores this.`);
    }
    if (m.arg === 'url' && !arg.includes('oriath.net')) return hint('warning', 'Only oriath.net URLs play.');
    if (m.range) {
      const [min, max] = m.range;
      const numbers = argNumbers(arg);
      const badIndex = numbers.findIndex((n) => n < min || n > max);
      const bad = numbers[badIndex];
      // "-p1" on the way to "-p1000": the last number can still grow into range.
      const typing = /\d$/.test(arg) && badIndex === numbers.length - 1 && couldGrowInto(bad, min, max);
      if (typing) return hint('incomplete');
      if (badIndex !== -1) {
        const upper = max === Number.MAX_SAFE_INTEGER ? 'or more' : `to ${max}`;
        return hint('warning', `${bad} is out of range. -${m.name} takes ${min} ${upper}.`);
      }
    }
    return hint('ok');
  }
  return null;
}

/**
 * Completions for the token under the cursor, or null when the text is not a
 * !tts command or the cursor is inside the command name.
 */
export function getCompletions(text: string, cursor: number, data: TtsData): CompletionResult | null {
  if (!COMMAND.test(text)) return null;
  if (cursor <= '!tts'.length) return null;

  const tokenStart = text.lastIndexOf(' ', cursor - 1) + 1;
  const nextSpace = text.indexOf(' ', cursor);
  const tokenEnd = nextSpace === -1 ? text.length : nextSpace;
  const prefix = text.slice(tokenStart, cursor);
  const token = text.slice(tokenStart, tokenEnd);

  const index = buildIndex(data);
  let suggestions: Suggestion[] = [];
  if (prefix.startsWith('-')) suggestions = dashSuggestions(index, prefix);
  else if (prefix.length > 0) suggestions = voiceSuggestions(index, prefix);

  // An exact match stays listed so Tab can add the space after it. Once the
  // space is there, accepting would change nothing, so hide it.
  if (suggestions.length === 1 && suggestions[0]!.insert === token && text[tokenEnd] === ' ') suggestions = [];

  return { tokenStart, tokenEnd, suggestions, hint: getHint(token, data) };
}
