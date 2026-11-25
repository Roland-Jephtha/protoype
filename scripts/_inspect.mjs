import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readdirSync } from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const name of readdirSync(root)) {
  try {
    const doc = await io.read(path.join(root, name, 'model.glb'));
    const r = doc.getRoot();
    let tris = 0;
    for (const m of r.listMeshes()) for (const p of m.listPrimitives()) { const idx = p.getIndices(); tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
    const skins = r.listSkins();
    const joints = skins.map((s) => s.listJoints().length);
    const sample = skins[0]?.listJoints().slice(0, 6).map((j) => j.getName()).join(',');
    const anims = r.listAnimations().map((a) => a.getName());
    const tex = r.listTextures().map((t) => { const s = t.getSize(); return s ? s[0] : '?'; });
    console.log(`\n== ${name}: meshes ${r.listMeshes().length}, tris ${Math.round(tris)}, skins ${skins.length} joints ${joints}, textures ${tex.length} (${[...new Set(tex)].join('/')})`);
    console.log('   bones:', sample);
    console.log('   anims', anims.length + ':', anims.slice(0, 45).join(' | '));
    if (name === 'injustice-collection') console.log('   nodes:', r.listScenes()[0].listChildren().flatMap((n) => n.listChildren().length ? n.listChildren().map((c) => c.getName()) : [n.getName()]).slice(0, 40).join(' | '));
  } catch (e) { console.log(name, 'ERR', e.message); }
}
