import { describe, expect, it } from 'vitest';
import { PLAYER } from '../src/config/gameConfig';
import { CITY, generateCityLayout } from '../src/game/world/cityLayout';

describe('generateCityLayout', () => {
  it('is deterministic for a given seed', () => {
    expect(generateCityLayout(42)).toEqual(generateCityLayout(42));
  });

  it('has no overlapping building footprints', () => {
    const { buildings } = generateCityLayout();
    for (let i = 0; i < buildings.length; i++) {
      for (let j = i + 1; j < buildings.length; j++) {
        const a = buildings[i];
        const b = buildings[j];
        const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2;
        const overlapZ = Math.abs(a.z - b.z) < (a.depth + b.depth) / 2;
        expect(overlapX && overlapZ, `buildings ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  it('keeps the spawn clear of buildings and inside the world boundary', () => {
    const layout = generateCityLayout();
    const [sx, , sz] = PLAYER.spawn;
    for (const b of layout.buildings) {
      const inside = Math.abs(sx - b.x) < b.width / 2 + 1 && Math.abs(sz - b.z) < b.depth / 2 + 1;
      expect(inside).toBe(false);
    }
    expect(Math.abs(sx)).toBeLessThan(layout.halfExtent);
    expect(Math.abs(sz)).toBeLessThan(layout.halfExtent);
  });

  it('has a landmark and varied building heights', () => {
    const layout = generateCityLayout();
    expect(layout.landmark).not.toBeNull();
    const heights = layout.buildings.map((b) => b.height);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(60);
    expect(layout.blocks).toHaveLength(CITY.blocksPerSide ** 2);
  });
});
