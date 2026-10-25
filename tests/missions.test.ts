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

describe('campaign objectives', () => {
  it('a defeat objective completes when the villain is beaten', async () => {
    const { DOOMSDAY } = await import('../src/missions/missions');
    let s = startMission(DOOMSDAY);
    const ctx = { region: 'desert' as const, x: 0, z: 0, interactPressed: false };
    expect(stepMission(DOOMSDAY, s, { ...ctx, defeated: [] }).state.complete).toBe(false);
    const r = stepMission(DOOMSDAY, s, { ...ctx, defeated: ['doomsday'] });
    s = r.state;
    expect(s.complete).toBe(true);
    expect(r.events.some((e) => e.type === 'missionComplete')).toBe(true);
  });

  it('a destroy objective counts drones from when it starts', async () => {
    const { HIGHWAY } = await import('../src/missions/missions');
    const ctx = { region: 'desert' as const, x: 0, z: 0, interactPressed: false };
    let s = startMission(HIGHWAY);
    s = stepMission(HIGHWAY, s, { ...ctx, dronesDestroyed: 7 }).state; // baseline: 7 already destroyed earlier
    s = stepMission(HIGHWAY, s, { ...ctx, dronesDestroyed: 10 }).state;
    expect(s.complete).toBe(false);
    expect(objectiveText(HIGHWAY, s, 10)).toContain('3/5');
    s = stepMission(HIGHWAY, s, { ...ctx, dronesDestroyed: 12 }).state;
    expect(s.complete).toBe(true);
  });

  it('every mission has an intro and objectives, and the campaign ids are unique', async () => {
    const { CAMPAIGN } = await import('../src/missions/missions');
    expect(new Set(CAMPAIGN.map((m) => m.id)).size).toBe(CAMPAIGN.length);
    for (const m of CAMPAIGN) {
      expect(m.intro.lines.length).toBeGreaterThan(0);
      expect(m.objectives.length).toBeGreaterThan(0);
    }
  });
});

describe('intro camera', () => {
  it('starts high over the focus and ends behind the hero, looking where he faces', async () => {
    const { buildIntro, introLength, sampleIntro } = await import('../src/game/cinematics/intro');
    const shots = buildIntro({ x: 0, z: 100 }, { x: 0, z: 0, facing: 0 }, () => 0);
    const pos = { x: 0, y: 0, z: 0 };
    const look = { x: 0, y: 0, z: 0 };
    sampleIntro(shots, 0, pos, look);
    expect(pos.y).toBeGreaterThan(40);
    sampleIntro(shots, introLength(shots), pos, look);
    expect(pos.z).toBeLessThan(0); // behind the hero (who faces +Z)
    expect(look.z).toBeGreaterThan(0);
  });
});

describe('checkpoints', () => {
  it('reaching a checkpoint objective records it, and a mission can resume there', async () => {
    const { checkpointSpawn } = await import('../src/missions/runner');
    let s = startMission(PROLOGUE);
    const r = stepMission(PROLOGUE, s, { region: 'forest', x: 0, z: 0, interactPressed: false });
    s = r.state;
    expect(r.events.some((e) => e.type === 'checkpoint')).toBe(true);
    expect(s.checkpoint).toBe(1);
    const resumed = startMission(PROLOGUE, s.checkpoint);
    expect(resumed.objectiveIndex).toBe(1);
    expect(checkpointSpawn(PROLOGUE, 1).region).toBe('forest');
    expect(checkpointSpawn(PROLOGUE, 0).region).toBe(PROLOGUE.startRegion);
  });
});

describe('Act I objectives', () => {
  const city = { region: 'metropolis' as const, interactPressed: false };

  it('the runaway bus objective completes when its flag is raised, and fails when time runs out', async () => {
    const { RUSH_HOUR } = await import('../src/missions/missions');
    let s = startMission(RUSH_HOUR);
    s = stepMission(RUSH_HOUR, s, { ...city, x: 0, z: 0, dt: 1, flags: new Set() }).state;
    expect(objectiveText(RUSH_HOUR, s)).toContain('74 s');
    expect(stepMission(RUSH_HOUR, s, { ...city, x: 0, z: 0, dt: 0.05, flags: new Set(['busStopped']) }).state.objectiveIndex).toBe(1);
    const late = stepMission(RUSH_HOUR, s, { ...city, x: 0, z: 0, dt: 80, flags: new Set() });
    expect(late.events).toContainEqual({ type: 'failed', reason: 'Time ran out.' });
  });

  it('carrying: pick someone up, bring them to the drop zone', async () => {
    const { RUSH_HOUR } = await import('../src/missions/missions');
    const o = RUSH_HOUR.objectives[1];
    if (o.type !== 'deliver') throw new Error('expected deliver');
    let s = startMission(RUSH_HOUR, 1);
    const p = o.pickups[0];
    let r = stepMission(RUSH_HOUR, s, { ...city, x: p.x + 1, z: p.z, interactPressed: true });
    s = r.state;
    expect(s.carrying).toBe(0);
    expect(r.events.some((e) => e.type === 'pickedUp')).toBe(true);
    r = stepMission(RUSH_HOUR, s, { ...city, x: o.dropZone.x, z: o.dropZone.z });
    s = r.state;
    expect(s.carrying).toBeUndefined();
    expect(s.done[0]).toBe(true);
    expect(objectiveText(RUSH_HOUR, s)).toContain('1/3');
  });

  it('rooftop pickups need the hero up on the roof', async () => {
    const { KORD_FIRE } = await import('../src/missions/missions');
    const o = KORD_FIRE.objectives[1];
    if (o.type !== 'deliver') throw new Error('expected deliver');
    const s = startMission(KORD_FIRE, 1);
    const p = o.pickups[0];
    expect(stepMission(KORD_FIRE, s, { ...city, x: p.x, z: p.z, y: 0, interactPressed: true }).state.carrying).toBeUndefined();
    expect(stepMission(KORD_FIRE, s, { ...city, x: p.x, z: p.z, y: 210, interactPressed: true }).state.carrying).toBe(0);
  });

  it('extinguish completes when every fire is out', async () => {
    const { KORD_FIRE } = await import('../src/missions/missions');
    const s = startMission(KORD_FIRE);
    expect(stepMission(KORD_FIRE, s, { ...city, x: 0, z: 0, firesOut: 4 }).state.objectiveIndex).toBe(0);
    expect(stepMission(KORD_FIRE, s, { ...city, x: 0, z: 0, firesOut: 5 }).state.objectiveIndex).toBe(1);
  });
});
