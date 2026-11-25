import { memo, useEffect } from 'react';
import { REGIONS, type RegionId, type TerrainRegion } from '../../config/regions';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { MissionDirector } from '../missions/MissionDirector';
import { CinematicCamera } from '../cinematics/CinematicCamera';
import { CombatDriver } from '../combat/CombatDriver';
import { Drones } from '../combat/Drones';
import { Lifting } from '../combat/Lifting';
import { Villains } from '../villains/Villains';
import { CityLife } from '../life/CityLife';
import { TerrainLife } from '../life/TerrainLife';
import { CityTraffic } from '../vehicles/CityTraffic';
import { Player } from '../player/Player';
import { runtime } from '../runtime';
import { METRO_BAY } from '../../config/world';
import { MetropolisBay, WaterBody } from './Water';
import { generateCityLayout } from './cityLayout';
import { Soldiers } from '../enemies/Soldiers';
import { oceanLevel } from './waterLevel';
import { DesertContent } from './desert/DesertContent';
import { ForestContent } from './forest/ForestContent';
import { AlienContent } from './alien/AlienContent';
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

  if (region.kind === 'city') {
    return (
      <>
        <TestDistrict />
        <MetropolisBay />
        <WaterBody level={bayWater} />
        <CityTraffic />
        <CityLife />
        <Player region={region} half={METRO_BAY.half} />
        <ThirdPersonCamera />
        <MissionDirector regionId={regionId} ground={cityGround} />
        <CinematicCamera regionId={regionId} ground={cityGround} />
        <CombatDriver />
        <Lifting />
        <Soldiers regionId={regionId} ground={cityGround} resolve={cityResolve} />
      </>
    );
  }
  return (
    <Terrain region={region}>
      {region.terrain.kind === 'desert' ? <DesertContent /> : region.terrain.kind === 'forest' ? <ForestContent /> : <AlienContent regionId={regionId} />}
      {region.terrain.kind !== 'alien' && <TerrainLife />}
      <TerrainPlayer region={region} />
      <ThirdPersonCamera />
      <TerrainMissions regionId={regionId} />
      <TerrainCombat regionId={regionId} />
    </Terrain>
  );
});

const cityGround = () => 0;
const cityBuildings = generateCityLayout().buildings;
/** Keeps walkers in the city out of buildings and on dry land. */
function cityResolve(x: number, z: number, r: number) {
  const edge = METRO_BAY.landHalf - 2;
  x = Math.max(-edge, Math.min(edge, x));
  z = Math.max(-edge, Math.min(edge, z));
  for (const b of cityBuildings) {
    const hx = b.width / 2 + r;
    const hz = b.depth / 2 + r;
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
    // Out through the nearest side.
    if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = b.x + Math.sign(dx || 1) * hx;
    else z = b.z + Math.sign(dz || 1) * hz;
  }
  return { x, z };
}
const bayWater = oceanLevel(METRO_BAY.landHalf, METRO_BAY.waterLevel);

function TerrainCombat({ regionId }: { regionId: RegionId }) {
  const { ground } = useTerrain();
  return (
    <>
      <CombatDriver />
      <Lifting />
      <Drones regionId={regionId} ground={ground} />
      <Soldiers regionId={regionId} ground={ground} />
      <Villains regionId={regionId} ground={ground} />
    </>
  );
}

function TerrainMissions({ regionId }: { regionId: RegionId }) {
  const { ground } = useTerrain();
  return (
    <>
      <MissionDirector regionId={regionId} ground={ground} />
      <CinematicCamera regionId={regionId} ground={ground} />
    </>
  );
}

/** Player standing on the terrain (spawn height from the exact surface). */
function TerrainPlayer({ region }: { region: TerrainRegion }) {
  const { ground } = useTerrain();
  return <Player region={region} half={region.size / 2} ground={ground} />;
}
