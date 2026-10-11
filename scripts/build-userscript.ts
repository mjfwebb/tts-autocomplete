// Builds the userscript version: .output/tts-autocomplete.user.js
// Usage: pnpm build:userscript

import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const { version, description } = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string;
  description: string;
};

// The release workflow attaches this file to every release under the same name,
// so the "latest" URL always points to the newest version.
const LATEST = 'https://github.com/mjfwebb/tts-autocomplete/releases/latest/download/tts-autocomplete.user.js';

const header = `// ==UserScript==
// @name         TTS Autocomplete
// @namespace    https://github.com/mjfwebb/tts-autocomplete
// @version      ${version}
// @description  ${description}
// @author       Michael Webb
// @license      MIT
// @homepageURL  https://github.com/mjfwebb/tts-autocomplete
// @match        https://*.twitch.tv/*
// @run-at       document-start
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      nice.gg
// @downloadURL  ${LATEST}
// @updateURL    ${LATEST}
// ==/UserScript==
`;

await build({
  entryPoints: ['userscript/main.ts'],
  outfile: '.output/tts-autocomplete.user.js',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  // Not minified, so people can read what they install.
  minify: false,
  legalComments: 'none',
  banner: { js: header },
});
console.log(`Built .output/tts-autocomplete.user.js (version ${version})`);
