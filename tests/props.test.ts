import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { pointsAlong, ribbonGeometry } from '../src/game/world/propGeometries';

describe('ribbonGeometry', () => {
  it('faces upward for paths in any direction (so roads are not back-face culled)', () => {
    for (const points of [
      [
        [0, 0],
        [100, 0],
      ],
      [
        [0, 0],
        [0, -100],
      ],
      [
        [50, 50],
        [-30, 10],
        [-80, 90],
      ],
    ] as [number, number][][]) {
      const g = ribbonGeometry({ points }, 10, () => 0, 0.05);
      const pos = g.attributes.position;
      const idx = g.index!;
      const a = new Vector3();
      const b = new Vector3();
      const c = new Vector3();
      for (let i = 0; i < idx.count; i += 3) {
        a.fromBufferAttribute(pos, idx.getX(i));
        b.fromBufferAttribute(pos, idx.getX(i + 1));
        c.fromBufferAttribute(pos, idx.getX(i + 2));
        const n = b.sub(a).cross(c.sub(a));
        expect(n.y).toBeGreaterThan(0);
      }
    }
  });
});

describe('pointsAlong', () => {
  it('spaces points evenly along a path', () => {
    const pts = pointsAlong({ points: [[0, 0], [0, 100]] }, 10);
    expect(pts.length).toBe(10);
    expect(pts[1].z - pts[0].z).toBeCloseTo(10);
  });
});
