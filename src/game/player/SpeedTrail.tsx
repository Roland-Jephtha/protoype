import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { SPEED_FORCE } from '../../config/combat';
import { runtime } from '../runtime';

const T = SPEED_FORCE.trail;
const N = T.samples;

/**
 * Speed Force afterimage: camera-facing ribbons of blue-white light trailing
 * from the hero's head, chest and hips, plus crackling lightning around him.
 * One dynamic geometry per effect; no lights.
 */
export function SpeedTrail() {
  const assets = useMemo(() => {
    const ribbons = T.heights.length;
    const geo = new BufferGeometry();
    // Per ribbon: N samples × 2 vertices.
    geo.setAttribute('position', new BufferAttribute(new Float32Array(ribbons * N * 2 * 3), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(ribbons * N * 2 * 3), 3));
    const index: number[] = [];
    for (let r = 0; r < ribbons; r++) {
      const o = r * N * 2;
      for (let i = 0; i < N - 1; i++) {
        const a = o + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setIndex(index);
    const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false });
    const boltGeo = new BufferGeometry();
    boltGeo.setAttribute('position', new BufferAttribute(new Float32Array(T.bolts * T.boltSegments * 2 * 3), 3));
    const boltMat = new LineBasicMaterial({ color: '#cfeaff', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, fog: false });
    return { geo, mat, boltGeo, boltMat };
  }, []);
  useEffect(
    () => () => {
      assets.geo.dispose();
      assets.mat.dispose();
      assets.boltGeo.dispose();
      assets.boltMat.dispose();
    },
    [assets],
  );

  const mesh = useRef<Mesh>(null);
  const bolts = useRef<LineSegments>(null);
  const st = useRef({
    hist: Array.from({ length: N }, () => new Vector3()),
    filled: 0,
    head: 0,
    strength: 0,
    boltTimer: 0,
    tmp: { a: new Vector3(), b: new Vector3(), d: new Vector3(), side: new Vector3(), view: new Vector3() },
    core: new Color(T.core),
    edge: new Color(T.edge),
  });

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const v = runtime.playerVelocity;
    const speed = Math.hypot(v.x, v.y, v.z);
    const want = runtime.speedForce && speed > T.minSpeed ? 1 : 0;
    s.strength += (want - s.strength) * Math.min(1, dt * (want ? 8 : 4));
    const visible = s.strength > 0.02;
    if (mesh.current) mesh.current.visible = visible;
    if (bolts.current) bolts.current.visible = visible && want > 0;
    const p = runtime.playerRenderPosition;
    // Record the hero's feet position every frame; reset the trail when it fades out.
    if (!visible) {
      s.filled = 0;
      return;
    }
    s.head = (s.head + 1) % N;
    s.hist[s.head].copy(p);
    s.filled = Math.min(N, s.filled + 1);

    const pos = assets.geo.getAttribute('position') as BufferAttribute;
    const col = assets.geo.getAttribute('color') as BufferAttribute;
    const { a, b, d, side, view } = s.tmp;
    T.heights.forEach((h, r) => {
      const o = r * N * 2;
      for (let i = 0; i < N; i++) {
        // i = 0 is the newest sample; older samples fade and thin out.
        const k = Math.min(i, s.filled - 1);
        a.copy(s.hist[(s.head - k + N) % N]);
        a.y += h;
        b.copy(s.hist[(s.head - Math.min(k + 1, s.filled - 1) + N) % N]);
        b.y += h;
        d.subVectors(a, b);
        if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
        // Face the camera: the ribbon's width is across the view.
        view.subVectors(camera.position, a).normalize();
        side.crossVectors(d, view).normalize();
        const fade = (1 - i / (N - 1)) * s.strength;
        const w = T.width * (0.35 + 0.65 * fade);
        pos.setXYZ(o + i * 2, a.x + side.x * w, a.y + side.y * w, a.z + side.z * w);
        pos.setXYZ(o + i * 2 + 1, a.x - side.x * w, a.y - side.y * w, a.z - side.z * w);
        const c = s.edge.clone().lerp(s.core, fade);
        const lum = fade * fade * T.brightness;
        col.setXYZ(o + i * 2, c.r * lum, c.g * lum, c.b * lum);
        col.setXYZ(o + i * 2 + 1, c.r * lum, c.g * lum, c.b * lum);
      }
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
    assets.geo.computeBoundingSphere();

    // Lightning: jagged bolts around the body, redrawn a few times a second.
    s.boltTimer -= dt;
    if (s.boltTimer <= 0) {
      s.boltTimer = T.boltEvery;
      const bp = assets.boltGeo.getAttribute('position') as BufferAttribute;
      let n = 0;
      for (let i = 0; i < T.bolts; i++) {
        // Start near the body, run back along the trail.
        const back = s.hist[(s.head - Math.min(s.filled - 1, 2 + i * 2) + N) % N];
        let x = p.x + (Math.random() - 0.5) * 0.8;
        let y = p.y + 0.4 + Math.random() * 1.4;
        let z = p.z + (Math.random() - 0.5) * 0.8;
        for (let j = 0; j < T.boltSegments; j++) {
          const f = 1 / T.boltSegments;
          const nx = x + (back.x - p.x) * f + (Math.random() - 0.5) * 0.5;
          const ny = y + (Math.random() - 0.5) * 0.5;
          const nz = z + (back.z - p.z) * f + (Math.random() - 0.5) * 0.5;
          bp.setXYZ(n++, x, y, z);
          bp.setXYZ(n++, nx, ny, nz);
          x = nx;
          y = ny;
          z = nz;
        }
      }
      bp.needsUpdate = true;
      assets.boltGeo.computeBoundingSphere();
    }
    if (bolts.current) (bolts.current.material as LineBasicMaterial).opacity = 0.9 * s.strength;
  });

  return (
    <>
      <mesh ref={mesh} geometry={assets.geo} material={assets.mat} frustumCulled={false} visible={false} renderOrder={5} />
      <lineSegments ref={bolts} geometry={assets.boltGeo} material={assets.boltMat} frustumCulled={false} visible={false} renderOrder={5} />
    </>
  );
}
