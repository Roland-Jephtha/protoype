import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, MeshBasicMaterial, MeshStandardMaterial, type InstancedMesh } from 'three';
import { useSettings } from '../../state/settings';
import { runtime } from '../runtime';
import { generateCityLayout } from '../world/cityLayout';
import { InstancedBoxes, type BoxInstance } from '../world/InstancedBoxes';
import { spawnVehicles } from './roadTraffic';
import { lightState, offsetPath, samplePath, type Lane, type LightGroup } from './traffic';
import { TrafficLayer } from './TrafficLayer';

/** Distance from an intersection centre to its stop line (street half-width + margin). */
const STOP_BACK = 8.5;
const PER_LANE = { low: 2, medium: 3, high: 4 } as const;

/**
 * Downtown traffic: two lanes on every street, stop lines at every
 * intersection, and traffic lights that run one shared cycle (X-axis streets,
 * then Z-axis streets).
 */
export function CityTraffic() {
  const quality = useSettings((s) => s.graphicsQuality);
  const layout = useMemo(() => generateCityLayout(), []);

  const lanes = useMemo<Lane[]>(() => {
    const ext = layout.halfExtent - 2;
    const xLines = layout.streetLines.filter((l) => l.axis === 'x').map((l) => l.offset); // streets running along Z
    const zLines = layout.streetLines.filter((l) => l.axis === 'z').map((l) => l.offset); // streets running along X
    const out: Lane[] = [];
    // Streets along Z (group 'z'): stop lines where they cross the X-running streets.
    for (const x of xLines) {
      for (const dir of [1, -1]) {
        const centre: [number, number][] = [
          [x, -ext * dir],
          [x, ext * dir],
        ];
        out.push({
          id: `z${x}${dir}`,
          path: samplePath(offsetPath(centre, 3.5)),
          speedLimit: 13,
          stops: zLines.map((z) => ({ s: (z * dir + ext) - STOP_BACK, group: 'z' as LightGroup })),
        });
      }
    }
    // Streets along X (group 'x').
    for (const z of zLines) {
      for (const dir of [1, -1]) {
        const centre: [number, number][] = [
          [-ext * dir, z],
          [ext * dir, z],
        ];
        out.push({
          id: `x${z}${dir}`,
          path: samplePath(offsetPath(centre, 3.5)),
          speedLimit: 13,
          stops: xLines.map((x) => ({ s: (x * dir + ext) - STOP_BACK, group: 'x' as LightGroup })),
        });
      }
    }
    return out;
  }, [layout]);

  const setup = useMemo(
    () =>
      spawnVehicles(
        lanes,
        PER_LANE[quality],
        [
          ['sedan', 50],
          ['taxi', 18],
          ['van', 15],
          ['pickup', 8],
          ['bus', 6],
        ],
        77,
      ),
    [lanes, quality],
  );

  return (
    <>
      <TrafficLayer lanes={lanes} setup={setup} groundY={() => 0} />
      <TrafficLights xLines={layout.streetLines.filter((l) => l.axis === 'x').map((l) => l.offset)} zLines={layout.streetLines.filter((l) => l.axis === 'z').map((l) => l.offset)} />
    </>
  );
}

const LAMP = { green: new Color('#3cff7a'), yellow: new Color('#ffd23c'), red: new Color('#ff3b30') };

/** A pole on each intersection corner; lamps show the light for the traffic they face. */
function TrafficLights({ xLines, zLines }: { xLines: number[]; zLines: number[] }) {
  const { poles, lamps } = useMemo(() => {
    const poles: BoxInstance[] = [];
    const lamps: { box: BoxInstance; group: LightGroup }[] = [];
    for (const x of xLines) {
      for (const z of zLines) {
        for (const [sx, sz, group] of [
          [-1, -1, 'z'],
          [1, 1, 'z'],
          [1, -1, 'x'],
          [-1, 1, 'x'],
        ] as [number, number, LightGroup][]) {
          const px = x + sx * (STOP_BACK + 0.5);
          const pz = z + sz * (STOP_BACK + 0.5);
          poles.push({ position: [px, 2.6, pz], size: [0.2, 5.2, 0.2] });
          lamps.push({ box: { position: [px, 5.1, pz], size: [0.5, 1.1, 0.5] }, group });
        }
      }
    }
    return { poles, lamps };
  }, [xLines, zLines]);

  const materials = useMemo(() => ({ pole: new MeshStandardMaterial({ color: '#2b2e33', roughness: 0.5, metalness: 0.6 }), lamp: new MeshBasicMaterial({ color: '#ffffff' }) }), []);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  // Recolour lamps only when the phase changes.
  const lampMesh = useRef<InstancedMesh | null>(null);
  const lastPhase = useRef('');
  useFrame(() => {
    const mesh = lampMesh.current;
    if (!mesh) return;
    const t = runtime.trafficTime;
    const phase = `${lightState('x', t)}|${lightState('z', t)}`;
    if (phase === lastPhase.current) return;
    lastPhase.current = phase;
    lamps.forEach((l, i) => mesh.setColorAt(i, LAMP[lightState(l.group, t)]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <InstancedBoxes items={poles} material={materials.pole} />
      <InstancedBoxes items={lamps.map((l) => ({ ...l.box, color: 0xffffff }))} material={materials.lamp} castShadow={false} meshRef={lampMesh} />
    </>
  );
}
