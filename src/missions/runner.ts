import type { MissionContext, MissionDef, MissionEvent, MissionState, MissionTarget, ObjectiveDef } from './types';

/**
 * Pure mission logic: given the current state and what the player is doing,
 * returns the next state plus events (for HUD messages, sounds, autosave).
 * No rendering or DOM, so it's unit-tested directly.
 */

/** A fresh mission state, optionally resuming at a checkpoint (objective index). */
export function startMission(def: MissionDef, fromCheckpoint = 0): MissionState {
  const i = Math.max(0, Math.min(def.objectives.length - 1, fromCheckpoint));
  return { missionId: def.id, objectiveIndex: i, done: initialDone(def.objectives[i]), complete: false, checkpoint: i };
}

/** Where the hero (re)starts for a checkpoint: the objective's checkpoint, else the mission start. */
export function checkpointSpawn(def: MissionDef, checkpoint: number) {
  const cp = checkpoint > 0 ? def.objectives[checkpoint]?.checkpoint : undefined;
  if (cp) return { region: cp.region, at: { x: cp.x, z: cp.z, facing: cp.facing } };
  return { region: def.startRegion, at: def.startAt };
}

function initialDone(o: ObjectiveDef | undefined): boolean[] {
  if (o?.type === 'interact') return o.targets.map(() => false);
  if (o?.type === 'deliver') return o.pickups.map(() => false);
  return [];
}

export function currentObjective(def: MissionDef, s: MissionState): ObjectiveDef | null {
  return s.complete ? null : (def.objectives[s.objectiveIndex] ?? null);
}

const dist = (t: MissionTarget, x: number, z: number) => Math.hypot(t.x - x, t.z - z);
/** Within reach, counting height for raised targets (rooftops). */
const within = (t: MissionTarget, x: number, z: number, y: number | undefined, r: number) => dist(t, x, z) <= r && (t.y === undefined || y === undefined || Math.abs(t.y - y) <= Math.max(3, r));

/** Interact target the player could act on right now (nearest undone in range), if any. */
export function availableInteraction(def: MissionDef, s: MissionState, ctx: Omit<MissionContext, 'interactPressed'>) {
  const o = currentObjective(def, s);
  if (!o || (o.type !== 'interact' && o.type !== 'deliver')) return null;
  if (o.type === 'deliver' && s.carrying !== undefined) return null;
  const list = o.type === 'interact' ? o.targets : o.pickups;
  let best: { index: number; target: MissionTarget; distance: number } | null = null;
  list.forEach((t, index) => {
    if (s.done[index] || t.region !== ctx.region) return;
    const d = dist(t, ctx.x, ctx.z);
    if (within(t, ctx.x, ctx.z, ctx.y, o.radius) && (!best || d < best.distance)) best = { index, target: t, distance: d };
  });
  return best as { index: number; target: MissionTarget; distance: number } | null;
}

/** Targets the HUD/world should mark for the current objective in `region`. */
export function activeTargets(def: MissionDef, s: MissionState, region: string): MissionTarget[] {
  const o = currentObjective(def, s);
  if (!o) return [];
  if (o.type === 'reach' || o.type === 'defeat' || o.type === 'destroy' || o.type === 'flag') return o.target.region === region ? [o.target] : [];
  if (o.type === 'deliver') return s.carrying !== undefined ? (o.dropZone.region === region ? [o.dropZone] : []) : o.pickups.filter((t, i) => !s.done[i] && t.region === region);
  if (o.type === 'extinguish') return o.fires.filter((t) => t.region === region);
  if (o.type === 'interact') return o.targets.filter((t, i) => !s.done[i] && t.region === region);
  return o.hint && o.hint.region === region ? [o.hint] : [];
}

export function stepMission(def: MissionDef, s: MissionState, ctx: MissionContext): { state: MissionState; events: MissionEvent[] } {
  const o = currentObjective(def, s);
  if (!o) return { state: s, events: [] };
  const events: MissionEvent[] = [];
  let next = s;
  let objectiveDone = false;

  // Time limit: the mission fails when the clock runs out.
  if (o.timeLimit !== undefined && ctx.dt !== undefined) {
    const objectiveTime = (s.objectiveTime ?? 0) + ctx.dt;
    next = { ...next, objectiveTime };
    if (objectiveTime > o.timeLimit) return { state: next, events: [{ type: 'failed', reason: 'Time ran out.' }] };
  }

  if (o.type === 'flag') {
    objectiveDone = !!ctx.flags?.has(o.flag);
  } else if (o.type === 'extinguish') {
    objectiveDone = (ctx.firesOut ?? 0) >= o.fires.length;
  } else if (o.type === 'deliver') {
    if (s.carrying === undefined) {
      const hit = ctx.interactPressed ? availableInteraction(def, s, ctx) : null;
      if (hit) {
        next = { ...next, carrying: hit.index };
        events.push({ type: 'pickedUp', objectiveId: o.id, index: hit.index });
      }
    } else if (ctx.region === o.dropZone.region && within(o.dropZone, ctx.x, ctx.z, ctx.y, o.dropRadius)) {
      const done = next.done.slice();
      done[s.carrying] = true;
      events.push({ type: 'targetDone', objectiveId: o.id, index: s.carrying, message: o.doneMessage });
      next = { ...next, done, carrying: undefined };
      objectiveDone = done.every(Boolean);
    }
  } else if (o.type === 'reachRegion') {
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
    const reachedCheckpoint = !complete && !!def.objectives[objectiveIndex]?.checkpoint;
    next = { ...next, objectiveIndex, complete, done: initialDone(def.objectives[objectiveIndex]), baseline: undefined, objectiveTime: 0, carrying: undefined, checkpoint: reachedCheckpoint ? objectiveIndex : next.checkpoint };
    if (reachedCheckpoint) events.push({ type: 'checkpoint', index: objectiveIndex });
    if (complete) events.push({ type: 'missionComplete' });
  }
  return { state: next, events };
}

/** "Rescue the survivors (1/3)" style progress text. */
export function objectiveText(def: MissionDef, s: MissionState, progress = 0): string {
  const o = currentObjective(def, s);
  if (!o) return '';
  const clock = o.timeLimit !== undefined ? ` · ${Math.max(0, Math.ceil(o.timeLimit - (s.objectiveTime ?? 0)))} s` : '';
  if (o.type === 'destroy') return `${o.text} (${Math.min(o.count, Math.max(0, progress - (s.baseline ?? progress)))}/${o.count})${clock}`;
  if (o.type === 'extinguish') return `${o.text} (${Math.min(o.fires.length, progress)}/${o.fires.length})${clock}`;
  if (o.type === 'deliver') return `${s.carrying !== undefined ? 'Bring them to safety' : o.text} (${s.done.filter(Boolean).length}/${o.pickups.length})${clock}`;
  if (clock) return `${o.text}${clock}`;
  if (o.type !== 'interact' || o.targets.length < 2) return o.text;
  return `${o.text} (${s.done.filter(Boolean).length}/${o.targets.length})`;
}
