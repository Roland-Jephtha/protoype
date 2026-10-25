import { REGIONS, type TerrainRegion } from '../config/regions';
import type { ForestParams } from '../game/world/terrainNoise';
import type { MissionDef } from './types';

const forest = (REGIONS.forest as TerrainRegion).terrain as ForestParams;
const crash = forest.flats[1]; // crash-site clearing

/**
 * Prologue — "The Night the Lights Went Out".
 * Built from what exists today: the city, the flight north, the forest crash site.
 */
export const PROLOGUE: MissionDef = {
  id: 'prologue',
  chapter: 'Prologue',
  title: 'The Night the Lights Went Out',
  briefing: [
    'A pulse of strange energy has swept through Metropolis. Every light in the city went dark at once.',
    'Moments later, Flight 2217 lost both engines on approach and went down in Blackwood Forest, north of the city.',
    'Emergency crews can’t reach the crash site in time. You can.',
  ],
  startRegion: 'metropolis',
  intro: {
    focus: { x: 0, z: -28 }, // the street in front of the landmark tower (the push-in stays outside buildings)
    lines: [
      'A pulse of strange energy has swept through Metropolis. Every light in the city went dark at once.',
      'Moments later, Flight 2217 went down in Blackwood Forest, north of the city.',
      'Emergency crews can’t reach the crash site in time. You can.',
    ],
  },
  objectives: [
    {
      id: 'fly-north',
      type: 'reachRegion',
      text: 'Fly north to Blackwood Forest',
      region: 'forest',
      hint: { region: 'metropolis', x: 0, z: -148, label: 'Blackwood Forest' },
    },
    {
      id: 'find-crash',
      type: 'reach',
      checkpoint: { region: 'forest', x: 0, z: 1050, facing: Math.PI },
      text: 'Find the crash site',
      target: { region: 'forest', x: crash.x, z: crash.z, label: 'Crash site' },
      radius: 55,
    },
    {
      id: 'rescue',
      type: 'interact',
      checkpoint: { region: 'forest', x: crash.x, z: crash.z + 60, facing: Math.PI },
      text: 'Rescue the survivors',
      radius: 3.5,
      prompt: 'Help',
      doneMessage: 'Survivor safe',
      // On open ground around the clearing, with clear paths between them and the wreck.
      targets: [
        { region: 'forest', x: crash.x - 28, z: crash.z + 18, label: 'Survivor' },
        { region: 'forest', x: crash.x + 4, z: crash.z + 32, label: 'Survivor' },
        { region: 'forest', x: crash.x + 30, z: crash.z - 22, label: 'Survivor' },
      ],
    },
    {
      id: 'investigate',
      type: 'interact',
      text: 'Investigate the wreckage',
      radius: 6,
      prompt: 'Investigate',
      doneMessage: 'A glowing residue clings to the engine… it isn’t jet fuel.',
      // The torn-off engine beyond the wing tip — reachable from open ground.
      targets: [{ region: 'forest', x: crash.x + 20, z: crash.z - 14, label: 'Engine' }],
    },
  ],
  outro:
    'All survivors are safe. The residue on the engine matches nothing on record — and someone was tracking this flight. The name on the encrypted signal: PROMETHEUS.',
};

const ON_PAN = { x: -520, z: 820 }; // Doomsday's salt pan
const RANGER = { x: 550, z: -470 }; // Zod at the ranger station
const CABINS = { x: -760, z: -560 }; // Subject Zero
const MESA = { x: 0, z: -420 }; // Darkseid


/** Plaza ambulance: where rescued people are brought. */
const AMBULANCE = { region: 'metropolis' as const, x: 12, z: 14, label: 'Ambulance' };

/** Chapter 1 — a bus with no brakes tears through downtown. */
export const RUSH_HOUR: MissionDef = {
  id: 'rush',
  chapter: 'Chapter 1',
  title: 'Rush Hour',
  briefing: ['A city bus has lost its brakes downtown.'],
  startRegion: 'metropolis',
  startAt: { x: 0, z: 8, facing: Math.PI },
  intro: {
    focus: { x: 31.5, z: 0 },
    lines: ['The blackout fried every traffic system in Metropolis.', 'Bus 61 has no brakes and forty people on board.', 'Catch it. Then help the people it hit.'],
  },
  objectives: [
    {
      id: 'bus',
      type: 'flag',
      text: 'Stop the runaway bus',
      flag: 'busStopped',
      actor: { kind: 'runawayBus', speed: 20, route: [[31.5, 84], [31.5, -84], [-24.5, -84], [-24.5, 84], [31.5, 84]] },
      target: { region: 'metropolis', x: 31.5, z: 0, label: 'Bus' },
      timeLimit: 75,
    },
    {
      id: 'injured',
      type: 'deliver',
      text: 'Carry the injured to the ambulance',
      checkpoint: { region: 'metropolis', x: 0, z: 8, facing: Math.PI },
      radius: 3.5,
      dropRadius: 8,
      prompt: 'Pick up',
      doneMessage: 'Safe with the paramedics',
      pickups: [
        { region: 'metropolis', x: 36.5, z: 30, label: 'Injured' },
        { region: 'metropolis', x: -19.5, z: -40, label: 'Injured' },
        { region: 'metropolis', x: 19.5, z: -60, label: 'Injured' },
      ],
      dropZone: AMBULANCE,
    },
  ],
  outro: 'Everyone on the bus walked away. The bus’s control unit was hacked — the signature matches the one from the crash. Prometheus again.',
};

/** Chapter 3 — the landmark tower is on fire. */
export const KORD_FIRE: MissionDef = {
  id: 'fire',
  chapter: 'Chapter 3',
  title: 'Fire at Kord Tower',
  briefing: ['Kord Tower is burning.'],
  startRegion: 'metropolis',
  startAt: { x: 0, z: 8, facing: Math.PI },
  intro: {
    focus: { x: 0, z: -45 },
    lines: ['An explosion tore through Kord Tower’s research floors.', 'The fire is climbing toward the roof — two workers are trapped up there.', 'Blow the fires out. Then bring them down.'],
  },
  objectives: [
    {
      id: 'fires',
      type: 'extinguish',
      text: 'Put out the fires (super breath)',
      timeLimit: 120,
      fires: [
        { region: 'metropolis', x: -6, y: 40, z: -44.4, label: 'Fire' },
        { region: 'metropolis', x: 5, y: 70, z: -44.4, label: 'Fire' },
        { region: 'metropolis', x: -4, y: 105, z: -44.4, label: 'Fire' },
        { region: 'metropolis', x: 6, y: 140, z: -44.4, label: 'Fire' },
        { region: 'metropolis', x: 0, y: 175, z: -44.4, label: 'Fire' },
      ],
    },
    {
      id: 'roof',
      type: 'deliver',
      text: 'Fly the trapped workers down',
      checkpoint: { region: 'metropolis', x: 0, z: 8, facing: Math.PI },
      radius: 3.5,
      dropRadius: 9,
      prompt: 'Pick up',
      doneMessage: 'Safe on the ground',
      pickups: [
        { region: 'metropolis', x: -5, z: -58, y: 210.2, label: 'Trapped worker' },
        { region: 'metropolis', x: 5, z: -53, y: 210.2, label: 'Trapped worker' },
      ],
      dropZone: AMBULANCE,
    },
  ],
  outro: 'Kord Tower stands. In the wreckage of the research floor: a Prometheus shipping manifest — a containment pod, bound for the desert test range.',
};

/** Chapter 2 — drones hit a convoy on the desert highway. */
export const HIGHWAY: MissionDef = {
  id: 'highway',
  chapter: 'Chapter 2',
  title: 'Highway Ambush',
  briefing: ['Prometheus drones are attacking the desert highway.'],
  startRegion: 'desert',
  startAt: { x: -620, z: 330, facing: Math.PI / 2 },
  drones: [{ x: -440, z: 330, radius: 55, count: 5 }],
  intro: {
    focus: { x: -440, z: 330 },
    lines: ['The signal from the crash leads east, to the desert.', 'Prometheus drones are tearing into the traffic on Route 9.', 'Take them out before anyone gets hurt.'],
  },
  objectives: [{ id: 'drones', type: 'destroy', text: 'Destroy the attack drones', count: 5, target: { region: 'desert', x: -440, z: 330, label: 'Drones' } }],
  outro: 'The highway is safe. One drone’s wreckage carries a serial number from the Prometheus test range — and something big was shipped there last night.',
};

/** Chapter 4 — Doomsday breaks loose on the salt pan. */
export const DOOMSDAY: MissionDef = {
  id: 'doomsday',
  chapter: 'Chapter 4',
  title: 'The Unstoppable',
  briefing: ['Something broke out of the Prometheus test range.'],
  startRegion: 'desert',
  startAt: { x: ON_PAN.x, z: ON_PAN.z - 70, facing: 0 },
  villains: ['doomsday'],
  intro: {
    focus: ON_PAN,
    lines: ['Last night, Prometheus moved a containment pod across the salt flats.', 'This morning the pod was empty.', 'It adapts. It heals. Don’t let it reach the city.'],
  },
  objectives: [{ id: 'doomsday', type: 'defeat', text: 'Defeat Doomsday', villain: 'doomsday', target: { region: 'desert', x: ON_PAN.x, z: ON_PAN.z, label: 'Doomsday' } }],
  outro: 'Doomsday is down — for now. Inside the empty pod: a Kryptonian sigil, and coordinates in Blackwood Forest.',
};

/** Chapter 5 — Zod waits at the ranger station. */
export const ZOD: MissionDef = {
  id: 'zod',
  chapter: 'Chapter 5',
  title: 'Kryptonian Warlord',
  briefing: ['A Kryptonian has landed in Blackwood Forest.'],
  startRegion: 'forest',
  startAt: { x: RANGER.x, z: RANGER.z + 80, facing: Math.PI },
  villains: ['zod'],
  intro: {
    focus: RANGER,
    lines: ['The coordinates lead to the old ranger station.', 'He was a general of Krypton. He came for the technology Prometheus stole.', 'He knows your powers — because they are his too.'],
  },
  objectives: [{ id: 'zod', type: 'defeat', text: 'Defeat General Zod', villain: 'zod', target: { region: 'forest', x: RANGER.x, z: RANGER.z, label: 'Zod' } }],
  outro: 'Zod falls. Before he fades, he laughs: “They already made one of you.”',
};

/** Chapter 6 — Prometheus’ clone. */
export const CLONE: MissionDef = {
  id: 'clone',
  chapter: 'Chapter 6',
  title: 'Subject Zero',
  briefing: ['Prometheus built a copy of you.'],
  startRegion: 'forest',
  startAt: { x: CABINS.x, z: CABINS.z + 80, facing: Math.PI },
  villains: ['clone'],
  intro: {
    focus: CABINS,
    lines: ['Behind the cabins: a hidden Prometheus lab.', 'Subject Zero. Your face. Your powers. None of your restraint.', 'Stop it before Prometheus sends it to Metropolis.'],
  },
  objectives: [{ id: 'clone', type: 'defeat', text: 'Defeat Subject Zero', villain: 'clone', target: { region: 'forest', x: CABINS.x, z: CABINS.z, label: 'Subject Zero' } }],
  outro: 'Subject Zero is beaten. Its last transmission went to a boom tube signature in the desert. Someone far worse is coming.',
};

/** Chapter 7 — Darkseid arrives. */
export const DARKSEID: MissionDef = {
  id: 'darkseid',
  chapter: 'Chapter 7',
  title: 'Apokolips Falls',
  briefing: ['Darkseid has come for Prometheus’ prize.'],
  startRegion: 'desert',
  startAt: { x: MESA.x, z: MESA.z + 80, facing: Math.PI },
  villains: ['darkseid'],
  intro: {
    focus: MESA,
    lines: ['Prometheus was never in charge. They were building it all for him.', 'Darkseid. Lord of Apokolips.', 'Everything ends here.'],
  },
  objectives: [{ id: 'darkseid', type: 'defeat', text: 'Defeat Darkseid', villain: 'darkseid', target: { region: 'desert', x: MESA.x, z: MESA.z, label: 'Darkseid' } }],
  outro: 'Darkseid retreats through the boom tube. Prometheus is finished, and Metropolis never knew how close it came. Thank you for playing.',
};

/** Play order. */
export const CAMPAIGN: MissionDef[] = [PROLOGUE, RUSH_HOUR, HIGHWAY, KORD_FIRE, DOOMSDAY, ZOD, CLONE, DARKSEID];

export const MISSIONS: Record<string, MissionDef> = Object.fromEntries(CAMPAIGN.map((m) => [m.id, m]));

