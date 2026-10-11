import { describe, expect, it } from 'vitest';
import { matchModifier } from '../src/modifiers';
import { getCompletions, getHint } from '../src/parser';
import type { TtsData } from '../src/types';

// Small fixture so the tests do not depend on the live sound list.
const data: TtsData = {
  voices: ['old', 'c3', 'brian', 'Brian', 'sing'],
  sounds: ['yay', 'yeet', 'fart3', 'chad', 'b_808_2', 'b_808_10', 'bigdog', 'upset', 'random', 'b'],
};

/** Runs getCompletions with the cursor at the "|" marker. */
function complete(input: string) {
  const cursor = input.indexOf('|');
  return getCompletions(input.replace('|', ''), cursor === -1 ? input.length : cursor, data);
}

function inserts(input: string) {
  return complete(input)?.suggestions.map((s) => s.insert);
}

describe('matchModifier', () => {
  it.each([
    ['-r5', 'r'],
    ['-r[2,8]', 'r'],
    ['-rc500', 'rc'],
    ['-pan2', 'pan'],
    ['-a90', 'a'],
    ['-n1,2,13', 'n'],
    ['-p1000', 'p'],
    ['-c500:1000', 'c'],
    ['-ck[1,5]:-1', 'ck'],
    ['-b', 'b'],
    ['-o', 'o'],
    ['-lfo', 'lfo'],
    ['-lfo80', 'lfo'],
    ['-lag', 'lag'],
    ['-echo500', 'echo'],
    ['-speak', 'speak'],
    ['-poehttps://oriath.net/a.ogg', 'poe'],
    ['-upfart3', 'up'],
    ['-downchad', 'down'],
  ])('%s is the -%s modifier', (word, name) => {
    expect(matchModifier(word)?.name).toBe(name);
  });

  it('does not match words without a valid argument', () => {
    for (const word of ['-r', '-rc', '-bonk', '-yay', 'hello', 'old:']) {
      expect(matchModifier(word)).toBeUndefined();
    }
  });
});

describe('getCompletions', () => {
  it('ignores messages that are not !tts commands', () => {
    expect(complete('hello -r')).toBeNull();
    expect(complete('!ttsx -r')).toBeNull();
    expect(complete('!tt|s -r')).toBeNull();
  });

  it('works for a bare "!tts "', () => {
    expect(complete('!tts |')).toMatchObject({ tokenStart: 5, tokenEnd: 5, suggestions: [] });
  });

  it('lists shorter modifiers first, then sounds', () => {
    expect(inserts('!tts -r')).toEqual(['-r', '-rc', '-random']);
  });

  it('marks modifiers with an optional value as complete', () => {
    // Otherwise Tab on "-lfo" would replace it with itself and never add the space.
    for (const name of ['lfo', 'lag', 'echo']) {
      const s = complete(`!tts -${name}`)!.suggestions.find((x) => x.insert === `-${name}`);
      expect({ name, complete: s?.complete }).toEqual({ name, complete: true });
    }
  });

  it('marks argument modifiers as incomplete', () => {
    const [r, rc] = complete('!tts -r')!.suggestions;
    expect(r!.complete).toBe(false);
    expect(rc!.complete).toBe(false);
    expect(complete('!tts -b')!.suggestions[0]).toMatchObject({ insert: '-b', complete: true });
  });

  it('sorts sounds naturally and adds substring matches after prefix matches', () => {
    expect(inserts('!tts -b_')).toEqual(['-b_808_2', '-b_808_10']);
    expect(inserts('!tts -dog')).toEqual(['-bigdog']);
    expect(inserts('!tts -ch')).toEqual(['-chad']);
  });

  it('leaves out shadowed sounds', () => {
    expect(inserts('!tts -ups')).toEqual([]);
  });

  it('offers sounds hidden by a modifier after -up and -down', () => {
    // "-b" is the reverse modifier, so the sound "b" is only playable as -upb or -downb.
    const plainSounds = complete('!tts -b')!
      .suggestions.filter((s) => s.kind === 'sound')
      .map((s) => s.insert);
    expect(plainSounds).not.toContain('-b');
    expect(inserts('!tts -upb')).toEqual(['-upb', '-upb_808_2', '-upb_808_10', '-upbigdog']);
    expect(inserts('!tts -upu')).toEqual(['-upupset']);
    expect(hint('-upb')?.status).toBe('ok');
  });

  it('completes sound names after -up and -down', () => {
    expect(inserts('!tts -upf')).toEqual(['-upfart3']);
    expect(inserts('!tts -downc')).toEqual(['-downchad']);
  });

  it('completes voices with a colon, without duplicates', () => {
    expect(inserts('!tts o')).toEqual(['old:']);
    expect(inserts('!tts br')).toEqual(['Brian:']);
    expect(inserts('!tts rand')).toEqual(['randomvoice:']);
    expect(inserts('!tts old:')).toEqual([]);
  });

  it('uses the token under the cursor, not the end of the text', () => {
    const result = complete('!tts -ye| hello');
    expect(result).toMatchObject({ tokenStart: 5, tokenEnd: 8 });
    expect(result!.suggestions.map((s) => s.insert)).toEqual(['-yeet']);
  });

  it('keeps an exact match until a space follows it', () => {
    expect(inserts('!tts -yeet')).toEqual(['-yeet']);
    expect(inserts('!tts -yeet| hello')).toEqual([]);
  });
});

const hint = (token: string) => getHint(token, data);

describe('getHint', () => {
  it('picks the longest matching modifier', () => {
    expect(hint('-rc5')?.modifier.name).toBe('rc');
    expect(hint('-r5')?.modifier.name).toBe('r');
    expect(hint('-pan')?.modifier.name).toBe('pan');
    expect(hint('-ck500:')?.modifier.name).toBe('ck');
  });

  it('reports incomplete, ok and out-of-range arguments', () => {
    expect(hint('-r')?.status).toBe('incomplete');
    expect(hint('-r[2,')?.status).toBe('incomplete');
    expect(hint('-r[2,8]')?.status).toBe('ok');
    expect(hint('-r11')).toMatchObject({ status: 'warning', message: '11 is out of range. -r takes 0 to 10.' });
    expect(hint('-n1,14')?.status).toBe('warning');
    expect(hint('-p6000')?.status).toBe('warning');
    expect(hint('-c500:')?.status).toBe('incomplete');
    expect(hint('-c500:-1')?.status).toBe('ok');
    expect(hint('-lag')?.status).toBe('ok');
    expect(hint('-poe')?.status).toBe('incomplete');
    expect(hint('-poehttps://example.com/a.ogg')?.status).toBe('warning');
  });

  it('does not warn about a number that more digits can bring into range', () => {
    expect(hint('-p1')?.status).toBe('incomplete');
    expect(hint('-p50')?.status).toBe('incomplete');
    expect(hint('-lfo2')?.status).toBe('incomplete');
    expect(hint('-rc0')?.status).toBe('incomplete');
    // Out of range for good: too large, or below the minimum but no longer being typed.
    expect(hint('-r11')?.status).toBe('warning');
    expect(hint('-n1,0,5')?.status).toBe('warning');
    // The first 0 is finished even though the last number has the same value.
    expect(hint('-n0,0')?.status).toBe('warning');
  });

  it('handles -up and -down sound arguments', () => {
    expect(hint('-upf')?.status).toBe('incomplete');
    expect(hint('-upfart3')?.status).toBe('ok');
    expect(hint('-upzzz')?.status).toBe('warning');
  });

  it('gives no hint for sounds, text and voices', () => {
    expect(hint('-yay')).toBeNull();
    expect(hint('-bonk')).toBeNull();
    expect(hint('-random')).toBeNull();
    expect(hint('old:')).toBeNull();
  });
});
