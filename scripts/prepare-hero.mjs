/**
 * Builds public/models/hero-ual.glb from Quaternius' CC0 "Universal Animation
 * Library [Standard]" (Godot glb). Keeps only the clips the game uses, then
 * resamples and prunes to shrink the file for mobile.
 *
 *   node scripts/prepare-hero.mjs "<path>/AnimationLibrary_Godot_Standard.glb"
 *
 * Source: https://opengameart.org/content/universal-animation-library (CC0)
 */
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const KEEP = [
  'Idle_Loop',
  'Walk_Loop',
  'Jog_Fwd_Loop',
  'Sprint_Loop',
  'Jump_Start',
  'Jump_Loop',
  'Jump_Land',
  'Crouch_Idle_Loop',
  'Punch_Jab',
  'Punch_Cross',
  'Hit_Chest',
  'Death01',
  'Interact',
  'PickUp_Table',
  'Roll',
  'Swim_Fwd_Loop',
  'Swim_Idle_Loop',
  'Spell_Simple_Shoot',
];

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/prepare-hero.mjs <AnimationLibrary_Godot_Standard.glb>');
  process.exit(2);
}
const out = path.resolve('public/models/hero-ual.glb');
mkdirSync(path.dirname(out), { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();

const kept = [];
for (const anim of root.listAnimations()) {
  if (KEEP.includes(anim.getName())) kept.push(anim.getName());
  else anim.dispose();
}
const missing = KEEP.filter((n) => !kept.includes(n));
if (missing.length) console.warn('Missing clips:', missing.join(', '));

// meshopt compresses geometry and animation; three.js decodes it (drei useGLTF wires MeshoptDecoder).
await doc.transform(resample(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);

console.log(`Kept ${kept.length} clips. ${statSync(src).size} → ${statSync(out).size} bytes → ${out}`);
