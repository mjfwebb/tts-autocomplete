/**
 * A fetch() built on the userscript manager's request function. Userscripts
 * cannot use fetch() for nice.gg, because the page's CORS rules apply to it.
 */
export function createGmFetch(gm: Pick<GmApi, 'xmlHttpRequest'>): (url: string) => Promise<Response> {
  return (url) =>
    new Promise((resolve, reject) => {
      gm.xmlHttpRequest({
        method: 'GET',
        url,
        timeout: 10_000,
        // Public data: send no cookies.
        anonymous: true,
        onload: (r) => {
          // Match the extension, which follows no redirects.
          if (r.finalUrl && r.finalUrl !== url) return reject(new Error(`Redirected to ${r.finalUrl}`));
          try {
            resolve(new Response(r.responseText, { status: r.status }));
          } catch {
            // new Response() rejects status 0, which some managers use for a failed request.
            reject(new Error(`HTTP ${r.status}`));
          }
        },
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Timed out')),
      });
    });
}
