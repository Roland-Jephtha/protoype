/**
 * Builds the upgraded character models in public/models/characters/ from
 * Sketchfab glb downloads (see docs/ASSET_MANIFEST.md for sources and
 * licences). Keeps only the animations the game uses, resamples them, and
 * meshopt-compresses geometry.
 *
 *   node scripts/prepare-characters.mjs <downloads-dir>
 *
 * <downloads-dir>/<name>/model.glb as fetched from the Sketchfab API.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCES = {
  // Superman (BvS suit) from kanimator's Injustice 2 | DCEU collection (CC BY 4.0): only his meshes are kept.
  'superman-injustice': {
    folder: 'injustice-collection',
    keep: [],
    extract: /SMBVS/,
    licence: 'Injustice 2 | DCEU | 3D Model Collection Rigged by kanimator — https://sketchfab.com/3d-models/injustice-2-dceu-3d-model-collection-rigged-e27284b707ec42aab42416ed39911d28 — CC BY 4.0 (Attribution). Original models credited to DatKofGuy and Carinhaqualquer. Superman (BvS) extracted.',
  },
  // DC Legends Darkseid by 3dworldz (CC BY 4.0): its own fighting animations.
  'darkseid-legends': {
    folder: 'darkseid-3dworldz',
    keep: ['IDLE002', 'MOVE001', 'APPROACH001_2', 'ATTACK001', 'ATTACK002', 'ATTACK003', 'DAMAGE001', 'DAMAGE002', 'STUN001', 'DIE001', 'DETECT001', 'SKILL001_1', 'SKILL002_1', 'SKILL004'],
    licence: 'Darkseid(Textured)(Rigged) by 3dworldz — https://sketchfab.com/3d-models/darkseidtexturedrigged-8f8af10c4910457792b8de8984c8a59e — CC BY 4.0 (Attribution).',
  },
  // Classic comics Doomsday by 3dmanx888 (CC BY 4.0): animated with retargeted clips.
  'doomsday-classic': {
    folder: 'doomsday-3dmanx888',
    keep: [],
    licence: 'Doomsday by 3dmanx888 — https://sketchfab.com/3d-models/doomsday-aca892b787e740d3a21832f480172856 — CC BY 4.0 (Attribution).',
  },
};

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/prepare-characters.mjs <downloads-dir>');
  process.exit(2);
}
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const outDir = path.resolve('public/models/characters');
mkdirSync(outDir, { recursive: true });

for (const [id, s] of Object.entries(SOURCES)) {
  const file = path.join(src, s.folder, 'model.glb');
  if (!existsSync(file)) {
    console.warn(`skip ${id}: ${file} not found`);
    continue;
  }
  const doc = await io.read(file);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!s.keep.includes(a.getName())) a.dispose();
  if (s.extract) {
    // One character out of a collection: drop every other mesh and skin.
    let skin = null;
    for (const n of root.listNodes()) {
      if (!n.getMesh()) continue;
      if (s.extract.test(n.getMesh().getName())) skin = n.getSkin();
      else {
        n.getMesh().dispose();
        n.setSkin(null);
      }
    }
    for (const k of root.listSkins()) if (k !== skin) k.dispose();
  }
  const missing = s.keep.filter((n) => !root.listAnimations().some((a) => a.getName() === n));
  if (missing.length) console.warn(`${id}: missing clips ${missing.join(', ')}`);
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  await doc.transform(resample(), dedup(), prune({ keepLeaves: false }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(outDir, `${id}.glb`);
  await io.write(out, doc);
  writeFileSync(path.join(outDir, `${id}-license.txt`), `${s.licence}\n`);
  console.log(`Wrote ${out} (${(statSync(out).size / 1e6).toFixed(2)} MB)`);
}
