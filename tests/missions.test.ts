import { describe, expect, it } from 'vitest';
import { PROLOGUE } from '../src/missions/missions';
import { activeTargets, availableInteraction, objectiveText, startMission, stepMission } from '../src/missions/runner';
import type { MissionContext, MissionState } from '../src/missions/types';

const at = (region: MissionContext['region'], x: number, z: number, interactPressed = false): MissionContext => ({ region, x, z, interactPressed });

function run(s: MissionState, ctx: MissionContext) {
  return stepMission(PROLOGUE, s, ctx);
}

describe('mission runner — prologue', () => {
  it('starts on the first objective with a hint toward the forest exit in the city', () => {
    const s = startMission(PROLOGUE);
    expect(objectiveText(PROLOGUE, s)).toBe('Fly north to Blackwood Forest');
    expect(activeTargets(PROLOGUE, s, 'metropolis')).toHaveLength(1);
    expect(activeTargets(PROLOGUE, s, 'desert')).toHaveLength(0);
  });

  it('advances when the hero reaches the forest, then the crash site', () => {
    let s = startMission(PROLOGUE);
    expect(run(s, at('metropolis', 0, 0)).state.objectiveIndex).toBe(0);
    s = run(s, at('forest', 0, 1050)).state;
    expect(s.objectiveIndex).toBe(1);
    const crash = activeTargets(PROLOGUE, s, 'forest')[0];
    expect(run(s, at('forest', crash.x + 200, crash.z)).state.objectiveIndex).toBe(1);
    s = run(s, at('forest', crash.x + 10, crash.z)).state;
    expect(s.objectiveIndex).toBe(2);
    expect(objectiveText(PROLOGUE, s)).toBe('Rescue the survivors (0/3)');
  });

  it('rescues survivors only when Interact is pressed in range, one at a time, then completes', () => {
    let s: MissionState = { ...startMission(PROLOGUE), objectiveIndex: 2, done: [false, false, false] };
    const survivors = activeTargets(PROLOGUE, s, 'forest');
    expect(survivors).toHaveLength(3);
    // Near but not pressing: nothing. Pressing out of range: nothing.
    expect(run(s, at('forest', survivors[0].x + 1, survivors[0].z)).events).toHaveLength(0);
    expect(run(s, at('forest', survivors[0].x + 20, survivors[0].z, true)).events).toHaveLength(0);
    expect(availableInteraction(PROLOGUE, s, at('forest', survivors[0].x + 1, survivors[0].z))?.index).toBe(0);

    for (let i = 0; i < 3; i++) {
      const r = run(s, at('forest', survivors[i].x, survivors[i].z + 1, true));
      expect(r.events[0]).toMatchObject({ type: 'targetDone', index: i });
      s = r.state;
    }
    expect(s.objectiveIndex).toBe(3);
    expect(objectiveText(PROLOGUE, s)).toBe('Investigate the wreckage');

    const wreck = activeTargets(PROLOGUE, s, 'forest')[0];
    const end = run(s, at('forest', wreck.x, wreck.z, true));
    expect(end.state.complete).toBe(true);
    expect(end.events.map((e) => e.type)).toEqual(['targetDone', 'objectiveComplete', 'missionComplete']);
    expect(activeTargets(PROLOGUE, end.state, 'forest')).toHaveLength(0);
  });

  it('does not double-count a survivor already rescued', () => {
    let s: MissionState = { ...startMission(PROLOGUE), objectiveIndex: 2, done: [false, false, false] };
    const t = activeTargets(PROLOGUE, s, 'forest')[0];
    s = run(s, at('forest', t.x, t.z, true)).state;
    const again = run(s, at('forest', t.x, t.z, true));
    expect(again.events).toHaveLength(0);
    expect(objectiveText(PROLOGUE, again.state)).toBe('Rescue the survivors (1/3)');
  });
});
