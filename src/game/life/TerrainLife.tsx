import { useCallback, useMemo } from 'react';
import { LIFE } from '../../config/world';
import { useSettings } from '../../state/settings';
import { nearPath } from '../world/propGeometries';
import { useTerrain } from '../world/terrainContext';
import type { Circler } from './behaviour';
import { Circlers, Herd, LifeBoundary, RiverFish, type HerdDef } from './Wildlife';

/**
 * Wildlife for the outdoor regions. Desert: coyotes and circling eagles.
 * Forest: wolf packs, eagles and piranhas leaping in the river. One pack is
 * placed near each arrival point so there's life in view straight away.
 */
export function TerrainLife() {
  const t = useTerrain();
  const quality = useSettings((s) => s.graphicsQuality);
  const terrain = t.region.terrain;
  const half = t.size / 2 - 20;

  const walkable = useCallback(
    (x: number, z: number) => {
      if (Math.abs(x) > half || Math.abs(z) > half || t.slope(x, z) > 0.5) return false;
      if (terrain.kind === 'desert') return !nearPath(terrain.highway, x, z, terrain.highway.width / 2 + 3);
      return !nearPath(terrain.river, x, z, terrain.river.width / 2 + 6) && !nearPath(terrain.road, x, z, terrain.road.width / 2 + 2) && !nearPath(terrain.rail, x, z, terrain.rail.width / 2 + 1);
    },
    [t, terrain, half],
  );

  const herds = useMemo<HerdDef[]>(() => {
    const n = LIFE.packSize[quality];
    const pack = (kind: HerdDef['kind'], x: number, z: number, radius: number): HerdDef =>
      ({ kind, count: n, home: { x, z, radius }, ...(kind === 'coyote' ? LIFE.coyote : LIFE.wolf) });
    return terrain.kind === 'desert'
      ? [pack('coyote', -950, 470, 90), pack('coyote', -300, 700, 130), pack('coyote', 500, 200, 150)]
      : [pack('wolf', -170, 1010, 80), pack('wolf', -700, 100, 120), pack('wolf', 500, 350, 130)];
  }, [terrain, quality]);

  const birds = useMemo<Circler[]>(
    () =>
      (terrain.kind === 'desert'
        ? [
            [-1000, 340, 120, 70],
            [350, 760, 150, 90],
            [0, -400, 130, 80],
          ]
        : [
            [0, 900, 90, 55],
            [-450, 380, 110, 70],
            [400, -300, 140, 80],
          ]
      ).map(([cx, cz, radius, altitude], i) => ({ cx, cz, radius, altitude, rate: (i % 2 ? -1 : 1) * (LIFE.birdSpeed / radius), phase: i * 2.1 })),
    [terrain],
  );

  const waterY = useCallback((x: number, z: number) => t.ground(x, z) + 2.2, [t]);

  return (
    <LifeBoundary>
      {herds.map((h, i) => (
        <Herd key={i} def={h} seed={500 + i * 31} ground={t.ground} walkable={walkable} />
      ))}
      <Circlers birds={birds} ground={t.ground} />
      {terrain.kind === 'forest' && <RiverFish river={terrain.river.points} count={LIFE.riverFish[quality]} waterY={waterY} seed={77} />}
    </LifeBoundary>
  );
}
