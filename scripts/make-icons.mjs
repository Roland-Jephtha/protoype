/**
 * Renders the PWA icons from public/icons/icon.svg (original emblem):
 *   node scripts/make-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg');
for (const [size, name, pad] of [
  [192, 'icon-192.png', 0],
  [512, 'icon-512.png', 0],
  // Maskable: keep the crest inside the safe zone (80% circle).
  [512, 'maskable-512.png', 52],
  [180, 'apple-touch-icon.png', 0],
]) {
  const inner = await sharp(svg, { density: 300 }).resize(size - pad * 2, size - pad * 2).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#0b1630' } }).composite([{ input: inner, top: pad, left: pad }]).png().toFile(`public/icons/${name}`);
  console.log('wrote', name);
}
