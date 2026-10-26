import { CylinderGeometry, BoxGeometry, type BufferGeometry } from 'three';
import { broadleafGeometry, cactusGeometry, coniferGeometry, merged, part, rockGeometry } from '../world/propGeometries';
import { VEHICLES, type VehicleType } from '../vehicles/vehicleGeometry';

/** World props the hero can pull up and throw. */
export type PropKind = 'streetLight' | 'conifer' | 'broadleaf' | 'rock' | 'boulder' | 'cactus';
/** Anything liftable: traffic vehicles and world props. */
export type LiftKind = VehicleType | PropKind;

export const LIFT_LABEL: Record<LiftKind, string> = {
  sedan: 'car',
  taxi: 'taxi',
  van: 'van',
  pickup: 'pickup',
  bus: 'bus',
  semi: 'truck',
  streetLight: 'street light',
  conifer: 'tree',
  broadleaf: 'tree',
  rock: 'rock',
  boulder: 'boulder',
  cactus: 'cactus',
};

const isVehicle = (k: LiftKind): k is VehicleType => k in VEHICLES;

/** City street lamp: post, arm and lamp head, ~6.3 m tall. */
export function streetLampGeometry(): BufferGeometry {
  return merged([
    part(new CylinderGeometry(0.1, 0.14, 6, 8), '#3b4048', 0, 3, 0),
    part(new BoxGeometry(0.12, 0.12, 1.4), '#3b4048', 0, 6, 0.6),
    part(new BoxGeometry(0.5, 0.22, 0.6), '#fff0c4', 0, 5.9, 1.2),
  ]);
}

/**
 * The carried / thrown shape of a liftable: centred on X/Z with its base at
 * y = 0 and its long axis along Z (tall props are laid down, like vehicles).
 */
export function buildLiftGeometry(kind: LiftKind): BufferGeometry {
  if (isVehicle(kind)) return VEHICLES[kind].build();
  const g =
    kind === 'streetLight'
      ? streetLampGeometry().rotateX(Math.PI / 2)
      : kind === 'conifer'
        ? coniferGeometry().rotateX(Math.PI / 2)
        : kind === 'broadleaf'
          ? broadleafGeometry().rotateX(Math.PI / 2)
          : kind === 'cactus'
            ? cactusGeometry().rotateX(Math.PI / 2)
            : rockGeometry(29);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.computeBoundingBox();
  return g;
}
