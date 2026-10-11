// Renders assets/icon.svg to the PNG sizes in public/icon/.
// Usage: pnpm icons

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const SIZES = [16, 32, 48, 96, 128];

// System font lookup can pick an unrelated font, so load the font file
// directly. Segoe UI Black is the design font. Arial Black is the fallback.
const FONTS = [
  { file: 'C:/Windows/Fonts/seguibl.ttf', family: 'Segoe UI' },
  { file: 'C:/Windows/Fonts/ariblk.ttf', family: 'Arial' },
  { file: '/Library/Fonts/Arial Black.ttf', family: 'Arial' },
  { file: '/usr/share/fonts/truetype/msttcorefonts/Arial_Black.ttf', family: 'Arial' },
];

const font = FONTS.find((f) => existsSync(f.file));
if (!font) {
  console.error('Cannot find Segoe UI Black or Arial Black. Install one of them, or add its path to FONTS.');
  process.exit(1);
}

const svg = readFileSync('assets/icon.svg', 'utf8');
mkdirSync('public/icon', { recursive: true });

for (const size of SIZES) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { fontFiles: [font.file], loadSystemFonts: false, defaultFontFamily: font.family },
  })
    .render()
    .asPng();
  writeFileSync(`public/icon/${size}.png`, png);
}
console.log(`Wrote ${SIZES.length} icons to public/icon/ with ${font.file}`);
