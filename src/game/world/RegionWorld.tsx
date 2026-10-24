import { memo, useEffect, useMemo } from 'react';
import { REGIONS, type RegionId, type TerrainRegion } from '../../config/regions';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { MissionDirector } from '../missions/MissionDirector';
import { Player } from '../player/Player';
import { runtime } from '../runtime';
import { generateCityLayout } from './cityLayout';
import { DesertContent } from './desert/DesertContent';
import { ForestContent } from './forest/ForestContent';
import { Terrain } from './Terrain';
import { useTerrain } from './terrainContext';
import { TestDistrict } from './TestDistrict';

/**
 * Mounts one region: its world, the player and the camera. Keyed by region in
 * GameCanvas, so travelling disposes the old world (meshes, colliders) entirely.
 */
// Memoised: pausing or other UI state changes re-render GameCanvas, but the world must not re-render.
export const RegionWorld = memo(function RegionWorld({ regionId }: { regionId: RegionId }) {
  const region = REGIONS[regionId];
  useEffect(() => {
    runtime.regionId = regionId;
  }, [regionId]);
  const cityHalf = useMemo(() => generateCityLayout().halfExtent, []);

  if (region.kind === 'city') {
    return (
      <>
        <TestDistrict />
        <Player region={region} half={cityHalf} />
        <ThirdPersonCamera />
        <MissionDirector regionId={regionId} ground={cityGround} />
      </>
    );
  }
  return (
    <Terrain region={region}>
      {region.terrain.kind === 'desert' ? <DesertContent /> : <ForestContent />}
      <TerrainPlayer region={region} />
      <ThirdPersonCamera />
      <TerrainMissions regionId={regionId} />
    </Terrain>
  );
});

const cityGround = () => 0;

function TerrainMissions({ regionId }: { regionId: RegionId }) {
  const { ground } = useTerrain();
  return <MissionDirector regionId={regionId} ground={ground} />;
}

/** Player standing on the terrain (spawn height from the exact surface). */
function TerrainPlayer({ region }: { region: TerrainRegion }) {
  const { ground } = useTerrain();
  return <Player region={region} half={region.size / 2} ground={ground} />;
}
