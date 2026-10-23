import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
} from 'three';

/**
 * Verlet cloth cape.
 *
 * A cols×rows particle grid simulated in world space. The top row is pinned
 * across the shoulders (following an anchor attached to the chest bone); the
 * rest hangs under gravity, is dragged by the air as the hero moves, and is
 * kept out of the body by capsule colliders following the skeleton.
 * ~100 particles × 4 constraint passes at 60 Hz: cheap enough for phones.
 */

export interface CapsuleCollider {
  a: Object3D;
  /** Second end; omit for a sphere at `a`. */
  b?: Object3D;
  radius: number;
}

export interface ClothCapeOptions {
  cols?: number;
  rows?: number;
  /** World-space dimensions (m). */
  length: number;
  topWidth: number;
  hemWidth: number;
  /** anchor-local units per metre (inverse of the model scale). */
  localPerMeter: number;
  color?: number;
}

const GRAVITY = new Vector3(0, -9.8, 0);
const STEP = 1 / 60;
const ITERATIONS = 4;
const DAMPING = 0.985;
/** Air drag (1/s): how strongly the cloth is pulled toward the air's velocity. */
const DRAG = 2.6;
/** How far (m) in front of the shoulder anchor the cloth may reach. */
const CHEST_MARGIN = 0.12;

type Constraint = [number, number, number]; // i, j, rest length

export class ClothCape {
  readonly mesh: Mesh;
  private readonly cols: number;
  private readonly rows: number;
  private readonly pos: Float32Array;
  private readonly prev: Float32Array;
  private readonly topLocal: Vector3[];
  private readonly constraints: Constraint[] = [];
  private readonly geometry: BufferGeometry;
  private readonly material: MeshStandardMaterial;
  private colliders: CapsuleCollider[] = [];
  private accumulator = 0;
  private time = 0;
  private initialised = false;
  private lastAnchor = new Vector3();
  private readonly segment: number;

  // Scratch vectors (no per-frame allocation).
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly pa = new Vector3();
  private readonly pb = new Vector3();
  private readonly forward = new Vector3();
  private readonly anchorPos = new Vector3();
  private readonly prevTop: Float32Array;
  private readonly nextTop: Float32Array;

  constructor(opts: ClothCapeOptions) {
    this.cols = opts.cols ?? 8;
    this.rows = opts.rows ?? 12;
    const { cols, rows } = this;
    const n = cols * rows;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.prevTop = new Float32Array(cols * 3);
    this.nextTop = new Float32Array(cols * 3);
    this.segment = opts.length / (rows - 1);

    // Pinned row: across the shoulders, wrapped slightly around the back.
    this.topLocal = [];
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1) - 0.5;
      const x = u * opts.topWidth;
      const z = -Math.pow(Math.abs(u) * 2, 2) * 0.05;
      this.topLocal.push(new Vector3(x * opts.localPerMeter, 0, z * opts.localPerMeter));
    }

    // Rest layout (flared trapezoid) defines constraint lengths.
    const rest = (c: number, r: number) => {
      const t = r / (rows - 1);
      const width = opts.topWidth + (opts.hemWidth - opts.topWidth) * t;
      return new Vector3((c / (cols - 1) - 0.5) * width, -t * opts.length, 0);
    };
    const id = (c: number, r: number) => r * cols + c;
    const add = (c1: number, r1: number, c2: number, r2: number) => {
      if (c2 < 0 || c2 >= cols || r2 >= rows) return;
      this.constraints.push([id(c1, r1), id(c2, r2), rest(c1, r1).distanceTo(rest(c2, r2))]);
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        add(c, r, c + 1, r); // structural
        add(c, r, c, r + 1);
        add(c, r, c + 1, r + 1); // shear
        add(c, r, c - 1, r + 1);
        add(c, r, c, r + 2); // bending (keeps it from crumpling like paper or folding flat)
        add(c, r, c + 2, r);
      }
    }

    // Mesh (world space: the mesh itself stays at identity).
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2);
    const index: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        uv[id(c, r) * 2] = c / (cols - 1);
        uv[id(c, r) * 2 + 1] = 1 - r / (rows - 1);
        if (c < cols - 1 && r < rows - 1) index.push(id(c, r), id(c, r + 1), id(c + 1, r), id(c + 1, r), id(c, r + 1), id(c + 1, r + 1));
      }
    }
    this.geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    this.geometry.setIndex(index);
    this.material = new MeshStandardMaterial({ color: opts.color ?? 0xb01826, roughness: 0.78, side: DoubleSide });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }

  setColliders(colliders: CapsuleCollider[]) {
    this.colliders = colliders;
  }

  private writeTop(anchor: Object3D, out: Float32Array) {
    for (let c = 0; c < this.cols; c++) {
      anchor.localToWorld(this.v.copy(this.topLocal[c]));
      out[c * 3] = this.v.x;
      out[c * 3 + 1] = this.v.y;
      out[c * 3 + 2] = this.v.z;
    }
  }

  /** Lays the cloth hanging straight down from the anchor (spawn / teleport). */
  reset(anchor: Object3D) {
    this.writeTop(anchor, this.nextTop);
    this.prevTop.set(this.nextTop);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = (r * this.cols + c) * 3;
        this.pos[i] = this.nextTop[c * 3];
        this.pos[i + 1] = this.nextTop[c * 3 + 1] - r * this.segment;
        this.pos[i + 2] = this.nextTop[c * 3 + 2];
      }
    }
    this.prev.set(this.pos);
    anchor.getWorldPosition(this.lastAnchor);
    this.initialised = true;
    this.writeGeometry();
  }

  /**
   * Advances the simulation. `airVelocity` is the wind in world space
   * (usually zero); the cape's own motion through the air creates the drag.
   */
  update(anchor: Object3D, dt: number, airVelocity: Vector3, flutter: number) {
    anchor.getWorldPosition(this.anchorPos);
    if (!this.initialised || this.anchorPos.distanceTo(this.lastAnchor) > 4) {
      this.reset(anchor);
      return;
    }
    this.lastAnchor.copy(this.anchorPos);

    // Anchor forward (+Z) in world: the cape must stay behind the chest plane.
    anchor.getWorldDirection(this.forward);

    this.prevTop.set(this.nextTop);
    this.writeTop(anchor, this.nextTop);

    this.accumulator = Math.min(this.accumulator + dt, STEP * 4);
    const steps = Math.floor(this.accumulator / STEP);
    for (let s = 0; s < steps; s++) {
      // Interpolate the pinned row across sub-steps so fast motion stays smooth.
      const alpha = (s + 1) / steps;
      this.step(alpha, airVelocity, flutter);
      this.accumulator -= STEP;
    }
    if (steps > 0) this.writeGeometry();
  }

  private step(alpha: number, air: Vector3, flutter: number) {
    const { pos, prev, cols, rows } = this;
    const dt2 = STEP * STEP;
    this.time += STEP;

    // Pinned row.
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < 3; k++) {
        const p = this.prevTop[c * 3 + k] + (this.nextTop[c * 3 + k] - this.prevTop[c * 3 + k]) * alpha;
        pos[c * 3 + k] = p;
        prev[c * 3 + k] = p;
      }
    }

    // Integrate free particles (Verlet) with gravity + air drag + flutter.
    for (let r = 1; r < rows; r++) {
      const t = r / (rows - 1);
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        for (let k = 0; k < 3; k++) {
          const vel = (pos[i + k] - prev[i + k]) * DAMPING;
          const particleVel = vel / STEP;
          let acc = GRAVITY.getComponent(k) + DRAG * (air.getComponent(k) - particleVel);
          // Turbulent flutter grows toward the hem and with speed.
          if (k !== 1) acc += Math.sin(this.time * 9 + r * 0.9 + c * 1.7 + k) * flutter * t;
          else acc += Math.sin(this.time * 11 + r * 1.3 + c) * flutter * 0.6 * t;
          prev[i + k] = pos[i + k];
          pos[i + k] += vel + acc * dt2;
        }
      }
    }

    for (let it = 0; it < ITERATIONS; it++) {
      for (const [a, b, restLen] of this.constraints) {
        const ia = a * 3;
        const ib = b * 3;
        const dx = pos[ib] - pos[ia];
        const dy = pos[ib + 1] - pos[ia + 1];
        const dz = pos[ib + 2] - pos[ia + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (d - restLen) / d;
        const pinnedA = a < cols;
        const pinnedB = b < cols;
        if (pinnedA && pinnedB) continue;
        const wa = pinnedA ? 0 : pinnedB ? 1 : 0.5;
        const wb = pinnedB ? 0 : pinnedA ? 1 : 0.5;
        pos[ia] += dx * diff * wa;
        pos[ia + 1] += dy * diff * wa;
        pos[ia + 2] += dz * diff * wa;
        pos[ib] -= dx * diff * wb;
        pos[ib + 1] -= dy * diff * wb;
        pos[ib + 2] -= dz * diff * wb;
      }
      this.collide();
    }
  }

  private collide() {
    const { pos, cols } = this;
    const n = pos.length / 3;
    // Chest plane: never let the cape swing through to the front of the torso.
    const f = this.forward;
    const ax = this.anchorPos.x;
    const ay = this.anchorPos.y;
    const az = this.anchorPos.z;
    for (let i = cols; i < n; i++) {
      const ahead = (pos[i * 3] - ax) * f.x + (pos[i * 3 + 1] - ay) * f.y + (pos[i * 3 + 2] - az) * f.z - CHEST_MARGIN;
      if (ahead > 0) {
        pos[i * 3] -= f.x * ahead;
        pos[i * 3 + 1] -= f.y * ahead;
        pos[i * 3 + 2] -= f.z * ahead;
      }
    }
    for (const col of this.colliders) {
      col.a.getWorldPosition(this.pa);
      if (col.b) col.b.getWorldPosition(this.pb);
      else this.pb.copy(this.pa);
      const seg = this.w.subVectors(this.pb, this.pa);
      const segLen2 = seg.lengthSq() || 1e-9;
      for (let i = cols; i < n; i++) {
        const px = pos[i * 3];
        const py = pos[i * 3 + 1];
        const pz = pos[i * 3 + 2];
        let t = ((px - this.pa.x) * seg.x + (py - this.pa.y) * seg.y + (pz - this.pa.z) * seg.z) / segLen2;
        t = Math.max(0, Math.min(1, t));
        const cx = this.pa.x + seg.x * t;
        const cy = this.pa.y + seg.y * t;
        const cz = this.pa.z + seg.z * t;
        const dx = px - cx;
        const dy = py - cy;
        const dz = pz - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < col.radius * col.radius) {
          const d = Math.sqrt(d2) || 1e-6;
          // Degenerate (inside the axis): push backwards, away from the chest.
          const nx = d > 1e-4 ? dx / d : -this.forward.x;
          const ny = d > 1e-4 ? dy / d : -this.forward.y;
          const nz = d > 1e-4 ? dz / d : -this.forward.z;
          pos[i * 3] = cx + nx * col.radius;
          pos[i * 3 + 1] = cy + ny * col.radius;
          pos[i * 3 + 2] = cz + nz * col.radius;
        }
      }
    }
  }

  private writeGeometry() {
    const attr = this.geometry.attributes.position as BufferAttribute;
    (attr.array as Float32Array).set(this.pos);
    attr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
