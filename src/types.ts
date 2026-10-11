/** Voice and sound names, as served by the /meta endpoint. */
export interface TtsData {
  voices: string[];
  sounds: string[];
}

export const EMPTY_DATA: TtsData = { voices: [], sounds: [] };

function isNames(list: unknown): list is string[] {
  return Array.isArray(list) && list.every((n) => typeof n === 'string');
}

export function isTtsData(value: unknown): value is TtsData {
  if (typeof value !== 'object' || value === null) return false;
  const { voices, sounds } = value as Record<string, unknown>;
  return isNames(voices) && isNames(sounds);
}

// Limits that real data never reaches. They protect against a broken or hostile server.
export const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_VOICES = 5_000;
const MAX_SOUNDS = 20_000;
// The server splits words on spaces and -up/-down take a word-character name,
// so a valid name is word characters only. This also keeps line breaks and
// invisible characters out of the chat box.
const NAME = /^\w{1,64}$/;

/** The lists with invalid names dropped, or null when the value is not usable. */
export function cleanTtsData(value: unknown): TtsData | null {
  if (!isTtsData(value)) return null;
  if (value.voices.length > MAX_VOICES || value.sounds.length > MAX_SOUNDS) return null;
  return {
    voices: value.voices.filter((n) => NAME.test(n)),
    sounds: value.sounds.filter((n) => NAME.test(n)),
  };
}

/** Message the content script sends to ask the background script for the lists. */
export const TTS_DATA_MESSAGE = 'tts-data';
