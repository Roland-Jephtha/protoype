import { describe, expect, it } from 'vitest';
import { VILLAIN_AI, VILLAINS } from '../src/config/villains';
import { mulberry32 } from '../src/game/world/cityLayout';
import { createVillain, damageVillain, spawnOmega, stepOmega, stepVillain, type Villain, type VillainContext, type VillainEvent } from '../src/game/villains/villainBrain';

const DT = 1 / 60;
const flat = () => 0;

function run(v: Villain, seconds: number, ctx: VillainContext) {
  const events: VillainEvent[] = [];
  for (let t = 0; t < seconds; t += DT) events.push(...stepVillain(v, DT, ctx));
  return events;
}
const ctxAt = (x: number, z: number, y = 0, heroActive = true): VillainContext => ({ hero: { x, y, z }, heroActive, groundY: flat, rand: mulberry32(5) });

describe('villain brain', () => {
  it('waits at its lair until the hero comes close, then engages', () => {
    const v = createVillain(VILLAINS.doomsday, 0, 0, flat);
    expect(run(v, 2, ctxAt(500, 0))).toHaveLength(0);
    expect(v.mode).toBe('dormant');
    const events = run(v, 0.1, ctxAt(40, 0));
    expect(events.some((e) => e.type === 'engaged')).toBe(true);
  });

  it('a ground brute closes in and lands punches, charges or slams on a standing hero', () => {
    const v = createVillain(VILLAINS.doomsday, 0, 0, flat);
    const events = run(v, 20, ctxAt(30, 0));
    const hits = events.filter((e) => e.type === 'hitHero');
    expect(hits.length).toBeGreaterThan(2);
    expect(events.some((e) => e.type === 'shockwave') || hits.some((e) => e.type === 'hitHero' && e.knock && Math.hypot(e.knock.x, e.knock.z) >= VILLAIN_AI.chargeKnock * 0.9)).toBe(true);
  });

  it('a flier follows the hero into the air', () => {
    const v = createVillain(VILLAINS.zod, 0, 0, flat);
    run(v, 6, ctxAt(20, 0, 30));
    expect(v.flying).toBe(true);
    expect(v.y).toBeGreaterThan(15);
  });

  it('is sent flying by a strong hit, lands, and gets back up', () => {
    const v = createVillain(VILLAINS.doomsday, 0, 0, flat);
    const ev = damageVillain(v, 10, { x: 40, y: 10, z: 0 });
    expect(ev.some((e) => e.type === 'launched')).toBe(true);
    run(v, 0.5, ctxAt(-20, 0));
    expect(v.y).toBeGreaterThan(1);
    expect(v.x).toBeGreaterThan(10);
    run(v, 3, ctxAt(-20, 0));
    expect(v.mode === 'engage' || v.mode === 'windup' || v.mode === 'charge' || v.mode === 'leap').toBe(true);
  });

  it('a weak hit only staggers a heavy villain', () => {
    const v = createVillain(VILLAINS.darkseid, 0, 0, flat);
    expect(damageVillain(v, 10, { x: 10, y: 2, z: 0 }).some((e) => e.type === 'launched')).toBe(false);
  });

  it('is defeated at zero health and returns later at full strength', () => {
    const v = createVillain(VILLAINS.zod, 0, 0, flat);
    const ev = damageVillain(v, 99999, { x: 0, y: 0, z: 10 });
    expect(ev.some((e) => e.type === 'defeated')).toBe(true);
    run(v, VILLAIN_AI.defeatedLie + 1, ctxAt(500, 0));
    expect(v.mode).toBe('gone');
    run(v, VILLAIN_AI.respawn + 0.1, ctxAt(500, 0));
    expect(v.mode).toBe('dormant');
    expect(v.health).toBe(VILLAINS.zod.health);
  });

  it('heat beams trail the hero: a still hero gets burned, a fast-moving one escapes most of it', () => {
    const still = createVillain(VILLAINS.zod, 0, 0, flat);
    still.mode = 'beam';
    still.timer = VILLAIN_AI.beamDuration;
    still.aim = { x: 0, y: 1.2, z: 20 }; // the windup locks the aim onto the hero
    const stillDamage = run(still, VILLAIN_AI.beamDuration, ctxAt(0, 20)).reduce((a, e) => a + (e.type === 'hitHero' ? e.amount : 0), 0);
    const moving = createVillain(VILLAINS.zod, 0, 0, flat);
    moving.mode = 'beam';
    moving.timer = VILLAIN_AI.beamDuration;
    moving.aim = { x: 0, y: 1.2, z: 20 };
    let x = 0;
    let movingDamage = 0;
    for (let t = 0; t < VILLAIN_AI.beamDuration; t += DT) {
      x += 20 * DT;
      for (const e of stepVillain(moving, DT, ctxAt(x, 20))) if (e.type === 'hitHero') movingDamage += e.amount;
    }
    expect(stillDamage).toBeGreaterThan(VILLAIN_AI.beamDps * VILLAIN_AI.beamDuration * 0.6);
    expect(movingDamage).toBeLessThan(stillDamage * 0.5);
  });

  it('omega beams curve onto the hero', () => {
    const bolts = spawnOmega({ x: 0, y: 3, z: 0 }, 4, mulberry32(1));
    let hits = 0;
    for (let t = 0; t < 6; t += DT) hits += stepOmega(bolts, DT, { x: 25, y: 0, z: 10 }, true, flat);
    expect(hits).toBeGreaterThanOrEqual(3);
  });
});

describe('frozen villains', () => {
  it('cannot act while frozen, and a frozen flier drops', async () => {
    const { freezeVillain } = await import('../src/game/villains/villainBrain');
    const v = createVillain(VILLAINS.zod, 0, 0, flat);
    run(v, 6, ctxAt(20, 0, 30));
    expect(v.flying).toBe(true);
    freezeVillain(v, 4, 6);
    const events = run(v, 3, ctxAt(1, 0, 0));
    expect(events.filter((e) => e.type === 'hitHero')).toHaveLength(0);
    expect(v.y).toBeLessThan(0.1);
  });
});
