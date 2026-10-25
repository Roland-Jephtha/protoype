import type { MissionContext, MissionDef, MissionEvent, MissionState, MissionTarget, ObjectiveDef } from './types';

/**
 * Pure mission logic: given the current state and what the player is doing,
 * returns the next state plus events (for HUD messages, sounds, autosave).
 * No rendering or DOM, so it's unit-tested directly.
 */

export function startMission(def: MissionDef): MissionState {
  return { missionId: def.id, objectiveIndex: 0, done: initialDone(def.objectives[0]), complete: false };
}

function initialDone(o: ObjectiveDef | undefined): boolean[] {
  return o?.type === 'interact' ? o.targets.map(() => false) : [];
}

export function currentObjective(def: MissionDef, s: MissionState): ObjectiveDef | null {
  return s.complete ? null : (def.objectives[s.objectiveIndex] ?? null);
}

const dist = (t: MissionTarget, x: number, z: number) => Math.hypot(t.x - x, t.z - z);

/** Interact target the player could act on right now (nearest undone in range), if any. */
export function availableInteraction(def: MissionDef, s: MissionState, ctx: Omit<MissionContext, 'interactPressed'>) {
  const o = currentObjective(def, s);
  if (!o || o.type !== 'interact') return null;
  let best: { index: number; target: MissionTarget; distance: number } | null = null;
  o.targets.forEach((t, index) => {
    if (s.done[index] || t.region !== ctx.region) return;
    const d = dist(t, ctx.x, ctx.z);
    if (d <= o.radius && (!best || d < best.distance)) best = { index, target: t, distance: d };
  });
  return best as { index: number; target: MissionTarget; distance: number } | null;
}

/** Targets the HUD/world should mark for the current objective in `region`. */
export function activeTargets(def: MissionDef, s: MissionState, region: string): MissionTarget[] {
  const o = currentObjective(def, s);
  if (!o) return [];
  if (o.type === 'reach' || o.type === 'defeat' || o.type === 'destroy') return o.target.region === region ? [o.target] : [];
  if (o.type === 'interact') return o.targets.filter((t, i) => !s.done[i] && t.region === region);
  return o.hint && o.hint.region === region ? [o.hint] : [];
}

export function stepMission(def: MissionDef, s: MissionState, ctx: MissionContext): { state: MissionState; events: MissionEvent[] } {
  const o = currentObjective(def, s);
  if (!o) return { state: s, events: [] };
  const events: MissionEvent[] = [];
  let next = s;
  let objectiveDone = false;

  if (o.type === 'reachRegion') {
    objectiveDone = ctx.region === o.region;
  } else if (o.type === 'defeat') {
    objectiveDone = !!ctx.defeated?.includes(o.villain);
  } else if (o.type === 'destroy') {
    const total = ctx.dronesDestroyed ?? 0;
    if (s.baseline === undefined) next = { ...s, baseline: total };
    else objectiveDone = total - s.baseline >= o.count;
  } else if (o.type === 'reach') {
    objectiveDone = ctx.region === o.target.region && dist(o.target, ctx.x, ctx.z) <= o.radius;
  } else if (ctx.interactPressed) {
    const hit = availableInteraction(def, s, ctx);
    if (hit) {
      const done = s.done.slice();
      done[hit.index] = true;
      next = { ...s, done };
      events.push({ type: 'targetDone', objectiveId: o.id, index: hit.index, message: o.doneMessage });
      objectiveDone = done.every(Boolean);
    }
  }

  if (objectiveDone) {
    events.push({ type: 'objectiveComplete', objectiveId: o.id });
    const objectiveIndex = next.objectiveIndex + 1;
    const complete = objectiveIndex >= def.objectives.length;
    next = { ...next, objectiveIndex, complete, done: initialDone(def.objectives[objectiveIndex]), baseline: undefined };
    if (complete) events.push({ type: 'missionComplete' });
  }
  return { state: next, events };
}

/** "Rescue the survivors (1/3)" style progress text. */
export function objectiveText(def: MissionDef, s: MissionState, progress = 0): string {
  const o = currentObjective(def, s);
  if (!o) return '';
  if (o.type === 'destroy') return `${o.text} (${Math.min(o.count, Math.max(0, progress - (s.baseline ?? progress)))}/${o.count})`;
  if (o.type !== 'interact' || o.targets.length < 2) return o.text;
  return `${o.text} (${s.done.filter(Boolean).length}/${o.targets.length})`;
}
