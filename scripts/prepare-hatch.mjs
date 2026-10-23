/**
 * Builds public/models/hatch-superman/hatch-superman.glb from the Sketchfab
 * glTF download of "Hatch Superman" by nitwit.friends (CC BY 4.0).
 *
 *   node scripts/prepare-hatch.mjs <folder with scene.gltf> [--inspect]
 *
 * - Resizes the 2048² PNG texture to 1024² WebP (mobile memory + download).
 * - meshopt-compresses geometry and animation.
 * - Copies the licence file next to the output.
 */
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const srcDir = process.argv[2];
const inspectOnly = process.argv.includes('--inspect');
if (!srcDir || !existsSync(path.join(srcDir, 'scene.gltf'))) {
  console.error('Usage: node scripts/prepare-hatch.mjs <folder containing scene.gltf> [--inspect]');
  process.exit(2);
}

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(path.join(srcDir, 'scene.gltf'));
const root = doc.getRoot();

for (const t of root.listTextures()) console.log('texture', t.getURI(), t.getMimeType(), t.getSize());
const hipsTrack = (anim) =>
  anim.listChannels().find((c) => /hips/i.test(c.getTargetNode()?.getName() ?? '') && c.getTargetPath() === 'translation');
for (const a of root.listAnimations()) {
  const dur = Math.max(...a.listSamplers().map((s) => s.getInput().getMax([])[0]));
  const t = hipsTrack(a);
  const out = t?.getSampler().getOutput();
  const range = out ? out.getMax([]).map((v, i) => +(v - out.getMin([])[i]).toFixed(1)) : null;
  console.log(`${a.getName().padEnd(20)} ${dur.toFixed(2)}s  hips translation range ${JSON.stringify(range)}`);
}
if (inspectOnly) process.exit(0);

// Locomotion clips were checked with --inspect: they are already in place
// (Hips translation varies <= 0.1 units = bob/sway only), so no root-motion stripping.

const sharp = (await import('sharp')).default;
await doc.transform(
  resample(),
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

const outDir = path.resolve('public/models/hatch-superman');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'hatch-superman.glb');
await io.write(outFile, doc);
if (existsSync(path.join(srcDir, 'license.txt'))) copyFileSync(path.join(srcDir, 'license.txt'), path.join(outDir, 'license.txt'));
console.log(`Wrote ${outFile} (${statSync(outFile).size} bytes)`);
