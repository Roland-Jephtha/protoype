import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { FLIGHT } from '../../config/gameConfig';
import { useApp } from '../../state/appStore';
import { impacts } from '../combat/impacts';
import { runtime } from '../runtime';
import { audio } from './audioEngine';

/**
 * Turns game state into sound each frame: wind with flight speed, heat-vision
 * hum, breath, Nova charge, ambience and a menace drone near villains, plus
 * one-shots for hits, explosions, the Nova, taking damage and throws.
 */
export function AudioDriver() {
  useEffect(() => {
    // Browsers only start audio from a user gesture.
    const unlock = () => audio.unlock();
    unlock();
    for (const e of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(e, unlock);
    return () => {
      for (const e of ['pointerdown', 'keydown', 'touchstart'] as const) window.removeEventListener(e, unlock);
      for (const l of ['wind', 'heat', 'heatHiss', 'breath', 'nova', 'hum', 'ambience'] as const) audio.setLoop(l, 0);
    };
  }, []);

  const last = useRef({ launches: runtime.launches, impact: 0, drones: runtime.dronesDestroyed, villains: runtime.villainsDefeated, nova: runtime.novaFlash, health: runtime.combat.health, carrying: false, frozen: 0, speedForce: false, enraged: runtime.bossEnraged, finisher: false });

  useFrame(() => {
    const paused = useApp.getState().paused;
    audio.setPaused(paused);
    if (paused) return;
    const v = runtime.playerVelocity;
    const speed = Math.hypot(v.x, v.y, v.z);
    // Wind rises with speed (mostly in flight / sprint).
    const k = Math.min(1, speed / FLIGHT.boostSpeed);
    audio.setLoop('wind', k * k * 1.2, { freq: 300 + k * 1500 });
    const beam = runtime.beam.active;
    audio.setLoop('heat', beam ? 1 : 0, { pitch: 90 + Math.sin(performance.now() / 60) * 6 });
    audio.setLoop('heatHiss', beam ? (runtime.beam.hitTarget || runtime.beam.surface ? 1 : 0.4) : 0);
    const br = runtime.breath.kind;
    audio.setLoop('breath', br === 'none' ? 0 : 1, { freq: br === 'freeze' ? 2600 : 800 });
    const charge = runtime.combat.novaCharge;
    audio.setLoop('nova', charge > 0 ? 0.4 + charge * 0.6 : 0, { pitch: 110 + charge * 330 });
    audio.setLoop('ambience', 1, { freq: runtime.regionId === 'desert' ? 700 : runtime.regionId === 'forest' ? 450 : runtime.regionId === 'apokolips' ? 160 : runtime.regionId === 'warworld' ? 240 : 300 });
    audio.setLoop('hum', runtime.boss ? 1 : 0);

    const l = last.current;
    // New hit flashes → punch / power sounds (the Nova has its own boom).
    for (const imp of impacts) {
      if (imp.born <= l.impact) continue;
      l.impact = imp.born;
      if (imp.kind === 'punch' || imp.kind === 'power') audio.play(imp.kind);
    }
    if (runtime.dronesDestroyed > l.drones || runtime.villainsDefeated > l.villains) audio.play('explosion');
    l.drones = runtime.dronesDestroyed;
    l.villains = runtime.villainsDefeated;
    if (runtime.novaFlash !== l.nova) audio.play('boom');
    if (runtime.launches !== l.launches) audio.play('boom', 0.35 + runtime.launchPower * 0.5);
    l.launches = runtime.launches;
    l.nova = runtime.novaFlash;
    const hp = runtime.combat.health;
    if (hp < l.health - 3) audio.play('hurt', (l.health - hp) / 25);
    l.health = hp;
    const carrying = !!runtime.carrying;
    if (l.carrying && !carrying) audio.play('throw');
    l.carrying = carrying;
    if (runtime.heroFrozen > 0 && l.frozen <= 0) audio.play('freeze');
    l.frozen = runtime.heroFrozen;
    if (runtime.speedForce !== l.speedForce) audio.play(runtime.speedForce ? 'slowIn' : 'slowOut');
    l.speedForce = runtime.speedForce;
    if (runtime.bossEnraged !== l.enraged) audio.play('boom', 0.8);
    l.enraged = runtime.bossEnraged;
    if (runtime.finisher && !l.finisher) audio.play('slowIn');
    l.finisher = !!runtime.finisher;
  });
  return null;
}
