import type { Vec3 } from './targets';

export type ImpactKind = 'punch' | 'power' | 'nova';

export interface Impact {
  x: number;
  y: number;
  z: number;
  kind: ImpactKind;
  /** performance.now() / 1000 when it happened. */
  born: number;
}

const MAX_IMPACTS = 16;

/** Recent hit flashes (punches, power hits, the Super Nova) for the effects layer to draw. */
export const impacts: Impact[] = [];

export function addImpact(p: Vec3, kind: ImpactKind) {
  impacts.push({ x: p.x, y: p.y, z: p.z, kind, born: performance.now() / 1000 });
  if (impacts.length > MAX_IMPACTS) impacts.shift();
}
