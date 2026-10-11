import { describe, expect, it } from 'vitest';
import { createGmFetch } from '../userscript/gm-fetch';

const URL = 'https://nice.gg/meta';

/** A fake userscript manager that answers every request with `reply`. */
function fakeGm(reply: (request: GmRequest) => void) {
  const requests: GmRequest[] = [];
  return {
    requests,
    gm: {
      xmlHttpRequest: (request: GmRequest) => {
        requests.push(request);
        reply(request);
      },
    },
  };
}

describe('createGmFetch', () => {
  it('turns a manager response into a Response', async () => {
    const { gm, requests } = fakeGm((r) => r.onload?.({ status: 200, responseText: '{"ok":1}', finalUrl: URL }));
    const response = await createGmFetch(gm)(URL);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"ok":1}');
    expect(requests[0]).toMatchObject({ method: 'GET', url: URL, timeout: 10_000, anonymous: true });
  });

  it.each([
    [
      'a redirect',
      'Redirected',
      (r: GmRequest) => r.onload?.({ status: 200, responseText: '', finalUrl: 'https://example.com/' }),
    ],
    ['status 0', 'HTTP 0', (r: GmRequest) => r.onload?.({ status: 0, responseText: '' })],
    ['a network error', 'Network error', (r: GmRequest) => r.onerror?.()],
    ['a timeout', 'Timed out', (r: GmRequest) => r.ontimeout?.()],
  ])('rejects %s', async (_name, message, reply) => {
    await expect(createGmFetch(fakeGm(reply).gm)(URL)).rejects.toThrow(message);
  });
});
