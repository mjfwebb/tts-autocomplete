// Modifier table for the !tts command. Patterns match the server's syntax.
// The array order is the order the server tests them, so keep it.

/** A number, or a random range written as [min,max]. */
const VALUE = String.raw`(?:\[-?\d+,-?\d+\]|-?\d+)`;
/** A prefix of VALUE, used while the user is still typing. */
const VALUE_PARTIAL = String.raw`(?:-?\d*|\[-?\d*(?:,-?\d*\]?)?)`;

export type ArgKind =
  | 'none'
  | 'value'
  | 'optionalValue'
  | 'cut'
  | 'notes'
  | 'digits'
  | 'optionalDigits'
  | 'url'
  | 'sound';

const ARG_PATTERNS: Record<ArgKind, { complete: RegExp; partial: RegExp }> = {
  none: { complete: /^$/, partial: /^$/ },
  value: { complete: new RegExp(`^${VALUE}$`), partial: new RegExp(`^${VALUE_PARTIAL}$`) },
  optionalValue: { complete: new RegExp(`^${VALUE}?$`), partial: new RegExp(`^${VALUE_PARTIAL}$`) },
  cut: {
    complete: new RegExp(`^${VALUE}:${VALUE}$`),
    partial: new RegExp(`^${VALUE_PARTIAL}(?::${VALUE_PARTIAL})?$`),
  },
  notes: { complete: /^[\d,]+$/, partial: /^[\d,]*$/ },
  digits: { complete: /^\d+$/, partial: /^\d*$/ },
  optionalDigits: { complete: /^\d*$/, partial: /^\d*$/ },
  url: { complete: /^.+$/, partial: /^.*$/ },
  sound: { complete: /^\w+$/, partial: /^\w*$/ },
};

export interface Modifier {
  /** Name without the leading dash, e.g. "rc". */
  name: string;
  arg: ArgKind;
  /** Short argument description shown while typing. */
  argHint?: string;
  /** Valid range for every number in the argument. */
  range?: [number, number];
  description: string;
}

export const MODIFIERS: Modifier[] = [
  {
    name: 'r',
    arg: 'value',
    argHint: 'speed 0 to 10, 6 is normal',
    range: [0, 10],
    description: 'Changes the speed of everything after it.',
  },
  {
    name: 'pan',
    arg: 'value',
    argHint: 'number of left-right sweeps, 1 to 100',
    range: [1, 100],
    description: 'Cyclic audio pan. -pan1 goes left to right, -pan2 goes left, right, left.',
  },
  {
    name: 'a',
    arg: 'value',
    argHint: 'angle 0 (left) to 180 (right), 90 is center',
    range: [0, 180],
    description: 'Audio pan.',
  },
  {
    name: 'poe',
    arg: 'url',
    argHint: 'https://oriath.net/Audio/... .ogg URL',
    description: 'Plays a sound hosted at oriath.net.',
  },
  {
    name: 'n',
    arg: 'notes',
    argHint: 'comma-separated notes, 1 to 13',
    range: [1, 13],
    description: 'Plays one or more musical notes.',
  },
  {
    name: 'p',
    arg: 'digits',
    argHint: 'milliseconds, 100 to 5000',
    range: [100, 5000],
    description: 'Pauses for N milliseconds.',
  },
  {
    name: 'c',
    arg: 'cut',
    argHint: 'start:end in milliseconds, -1 means the end',
    range: [-1, Number.MAX_SAFE_INTEGER],
    description: 'Cuts a section out of the next sound.',
  },
  {
    name: 'ck',
    arg: 'cut',
    argHint: 'start:end in milliseconds, -1 means the end',
    range: [-1, Number.MAX_SAFE_INTEGER],
    description: 'Plays only the cut section of the next sound.',
  },
  {
    name: 'b',
    arg: 'none',
    description: 'Toggles playing everything in reverse.',
  },
  {
    name: 'o',
    arg: 'none',
    description: 'Toggles playing all sounds at once.',
  },
  {
    name: 'lfo',
    arg: 'optionalValue',
    argHint: 'optional rate, 20 to 200, default 50',
    range: [20, 200],
    description: 'Toggles a wobble (low-frequency oscillation) effect.',
  },
  {
    name: 'lag',
    arg: 'optionalDigits',
    argHint: 'optional period in samples, default 1000',
    description: 'Toggles lag, which makes sounds sound laggy.',
  },
  {
    name: 'echo',
    arg: 'optionalDigits',
    argHint: 'optional period in samples, default 1000',
    description: 'Toggles an echo effect.',
  },
  {
    name: 'speak',
    arg: 'none',
    description: 'Toggles replacing known words with matching sound clips.',
  },
  {
    name: 'rc',
    arg: 'value',
    argHint: 'length in milliseconds, at least 1',
    range: [1, Number.MAX_SAFE_INTEGER],
    description: 'Plays N milliseconds from a random point of the next sound.',
  },
  {
    name: 'up',
    arg: 'sound',
    argHint: 'sound name',
    description: 'Plays a sound at every speed, slowest first.',
  },
  {
    name: 'down',
    arg: 'sound',
    argHint: 'sound name',
    description: 'Plays a sound at every speed, fastest first.',
  },
];

/** Full-token regex for a modifier, as the server matches it. */
function modifierRegex(m: Modifier): RegExp {
  // The server matches -poe as a prefix only.
  if (m.arg === 'url') return new RegExp(`^-${m.name}`);
  const arg = ARG_PATTERNS[m.arg].complete.source.slice(1, -1);
  return new RegExp(`^-${m.name}(?:${arg})$`);
}

export function argIsComplete(m: Modifier, arg: string): boolean {
  return ARG_PATTERNS[m.arg].complete.test(arg);
}

export function argIsPartial(m: Modifier, arg: string): boolean {
  return ARG_PATTERNS[m.arg].partial.test(arg);
}

/** All integers written in an argument, e.g. "[2,8]:-1" gives [2, 8, -1]. */
export function argNumbers(arg: string): number[] {
  return [...arg.matchAll(/-?\d+/g)].map((m) => Number(m[0]));
}

const MODIFIER_REGEXES = MODIFIERS.map((m) => [m, modifierRegex(m)] as const);

/** The modifier the server applies to a whole word, if any. The first match wins, as on the server. */
export function matchModifier(word: string): Modifier | undefined {
  return MODIFIER_REGEXES.find(([, re]) => re.test(word))?.[0];
}
