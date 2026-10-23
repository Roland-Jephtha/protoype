/** Bone-name helpers shared across rigs (Mixamo and Quaternius/Rigify naming). */

/** Normalizes bone names across rigs: drops "mixamorig", "DEF-", ':', '.', and trailing "_NN". */
export function canonicalBoneName(name: string): string {
  return name
    .replace(/^mixamorig:?/i, '')
    .replace(/^DEF-/i, '')
    .replace(/[:.]/g, '')
    .replace(/_\d+$/, '');
}

/** Mixamo bone (canonical) → Quaternius Universal Animation Library bone (canonical). */
export const MIXAMO_FROM_UAL: Record<string, string> = (() => {
  const map: Record<string, string> = {
    Hips: 'hips',
    Spine: 'spine001',
    Spine1: 'spine002',
    Spine2: 'spine003',
    Neck: 'neck',
    Head: 'head',
  };
  for (const [S, s] of [
    ['Left', 'L'],
    ['Right', 'R'],
  ]) {
    map[`${S}Shoulder`] = `shoulder${s}`;
    map[`${S}Arm`] = `upper_arm${s}`;
    map[`${S}ForeArm`] = `forearm${s}`;
    map[`${S}Hand`] = `hand${s}`;
    for (let i = 1; i <= 3; i++) {
      map[`${S}HandThumb${i}`] = `thumb0${i}${s}`;
      map[`${S}HandIndex${i}`] = `f_index0${i}${s}`;
      map[`${S}HandMiddle${i}`] = `f_middle0${i}${s}`;
      map[`${S}HandRing${i}`] = `f_ring0${i}${s}`;
      map[`${S}HandPinky${i}`] = `f_pinky0${i}${s}`;
    }
    map[`${S}UpLeg`] = `thigh${s}`;
    map[`${S}Leg`] = `shin${s}`;
    map[`${S}Foot`] = `foot${s}`;
    map[`${S}ToeBase`] = `toe${s}`;
  }
  return map;
})();
