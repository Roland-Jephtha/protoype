import { Color, NormalBlending, Matrix4, Vector3, MeshBasicMaterial, type Bone, type Material, type Mesh, type MeshStandardMaterial, type Object3D, type Scene, type Texture } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SPEED_FORCE } from '../../config/combat';

const A = SPEED_FORCE.afterimages;

interface Ghost {
  root: Object3D;
  bones: Bone[];
  materials: MeshBasicMaterial[];
  /** Seconds since its snapshot (Infinity = unused). */
  age: number;
}

/**
 * Speed Force afterimages: see-through copies of the hero in his suit's blue
 * and red, each frozen in the pose he had a moment ago, left behind as he
 * runs (Flash / Quicksilver style). Ghosts are clones of the hero model whose
 * bones copy the live skeleton at the instant of the snapshot.
 */
export class AfterimageTrail {
  private readonly ghosts: Ghost[] = [];
  private readonly liveBones: Bone[] = [];
  private next = 0;
  private sinceShot = 0;
  /** Where the last snapshot was taken (world), to fill the gap when he moves far in one frame. */
  private readonly last = new Vector3();
  private hasLast = false;
  private readonly cur = new Vector3();
  private readonly m = new Matrix4();

  private readonly live: Object3D;

  constructor(live: Object3D, count: number) {
    this.live = live;
    live.traverse((o) => {
      if ((o as Bone).isBone) this.liveBones.push(o as Bone);
    });
    for (let i = 0; i < count; i++) {
      const root = cloneSkinned(live);
      const materials: MeshBasicMaterial[] = [];
      const tint = new Color(i % 2 ? A.red : A.blue);
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const make = (m: Material) => {
          const g = new MeshBasicMaterial({ map: (m as MeshStandardMaterial).map as Texture | null, color: tint, transparent: true, opacity: 0, blending: NormalBlending, depthWrite: false, fog: false });
          materials.push(g);
          return g;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(make) : make(mesh.material);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
      });
      const bones: Bone[] = [];
      root.traverse((o) => {
        if ((o as Bone).isBone) bones.push(o as Bone);
      });
      root.matrixAutoUpdate = false;
      root.visible = false;
      this.ghosts.push({ root, bones, materials, age: Infinity });
    }
  }

  addTo(scene: Scene) {
    for (const g of this.ghosts) scene.add(g.root);
  }

  removeFrom(scene: Scene) {
    for (const g of this.ghosts) scene.remove(g.root);
  }

  /** Call after the hero has been posed this frame. `active`: Speed Force on and moving. */
  update(dt: number, active: boolean) {
    this.sinceShot += dt;
    if (!active) this.hasLast = false;
    this.cur.setFromMatrixPosition(this.live.matrixWorld);
    const moved = this.hasLast ? this.cur.distanceTo(this.last) : 0;
    if (active && this.ghosts.length && (this.sinceShot >= A.interval || moved >= A.spacing)) {
      this.sinceShot = 0;
      // Moving fast: several copies spread along the path covered since the last one, so the blur never shows gaps.
      const n = this.hasLast ? Math.min(A.maxPerFrame, Math.max(1, Math.ceil(moved / A.spacing))) : 1;
      for (let s = 1; s <= n; s++) {
        this.m.copy(this.live.matrixWorld as Matrix4);
        if (this.hasLast) {
          const p = this.last.clone().lerp(this.cur, s / n);
          this.m.setPosition(p);
        }
        this.snapshot(this.m);
      }
      this.last.copy(this.cur);
      this.hasLast = true;
    }
    for (const g of this.ghosts) {
      g.age += dt;
      const k = g.age / A.life;
      g.root.visible = k < 1;
      if (!g.root.visible) continue;
      const o = A.opacity * Math.pow(1 - k, 1.5);
      for (const m of g.materials) m.opacity = o;
    }
  }

  /** Freezes the live pose into the next ghost, placed at `matrix`. */
  private snapshot(matrix: Matrix4) {
    const g = this.ghosts[this.next];
    this.next = (this.next + 1) % this.ghosts.length;
    g.root.matrix.copy(matrix);
    g.bones.forEach((b, i) => {
      const src = this.liveBones[i];
      if (!src) return;
      b.position.copy(src.position);
      b.quaternion.copy(src.quaternion);
      b.scale.copy(src.scale);
    });
    g.root.updateMatrixWorld(true);
    g.age = 0;
  }

  dispose() {
    for (const g of this.ghosts) g.materials.forEach((m) => m.dispose());
  }
}
