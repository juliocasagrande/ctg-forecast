import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const svgPath = resolve(__dirname, 'frontend/public/logo.svg');
const svg = readFileSync(svgPath, 'utf-8');

const icons = [
  { file: 'pwa-192x192.png', size: 192 },
  { file: 'pwa-512x512.png', size: 512 },
];

for (const { file, size } of icons) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: '#001F5B',
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  const outPath = resolve(__dirname, 'frontend/public', file);
  writeFileSync(outPath, png);
  console.log(`✅ ${file} (${size}x${size})`);
}
