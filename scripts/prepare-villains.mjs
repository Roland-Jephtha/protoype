/**
 * Builds public/models/villains/<id>.glb from Sketchfab glTF downloads
 * (DavidA3D's DC film villains, CC BY-NC 4.0 — see docs/ASSET_MANIFEST.md).
 *
 *   node scripts/prepare-villains.mjs
 *
 * Untextured models (named flat-colour materials), so only geometry is
 * meshopt-compressed; the empty placeholder animation Darkseid ships with is
 * dropped. Licences are copied next to the outputs.
 */
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SOURCES = {
  doomsday: 'doomsday_batman_v_superman_rigged',
  zod: 'general_zod_michael_shannon_-_rigged',
  darkseid: 'darkseid_-_rigged_ray_porter',
};

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const outDir = path.resolve('public/models/villains');
mkdirSync(outDir, { recursive: true });

for (const [id, folder] of Object.entries(SOURCES)) {
  const src = path.join(folder, 'scene.gltf');
  if (!existsSync(src)) {
    console.warn(`skip ${id}: ${src} not found`);
    continue;
  }
  const doc = await io.read(src);
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(outDir, `${id}.glb`);
  await io.write(out, doc);
  if (existsSync(path.join(folder, 'license.txt'))) copyFileSync(path.join(folder, 'license.txt'), path.join(outDir, `${id}-license.txt`));
  console.log(`Wrote ${out} (${statSync(out).size} bytes)`);
}
