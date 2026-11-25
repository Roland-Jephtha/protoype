import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const r = doc.getRoot();
  console.log('\n==', f.split('/').slice(-2)[0]);
  console.log(r.listSkins()[0].listJoints().map((j) => j.getName()).join(', '));
  const top = r.listScenes()[0].listChildren();
  const show = (n, d) => { if (d > 3) return; console.log(' '.repeat(d * 2) + n.getName(), 'r', n.getRotation().map((v) => v.toFixed(2)).join(','), 's', n.getScale().map((v) => v.toFixed(3)).join(',')); n.listChildren().slice(0, 3).forEach((c) => show(c, d + 1)); };
  top.forEach((n) => show(n, 0));
  for (const a of r.listAnimations()) console.log(' anim', a.getName(), a.listChannels().length, 'ch');
}
