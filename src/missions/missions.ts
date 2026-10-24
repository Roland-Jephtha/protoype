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
      text: 'Find the crash site',
      target: { region: 'forest', x: crash.x, z: crash.z, label: 'Crash site' },
      radius: 55,
    },
    {
      id: 'rescue',
      type: 'interact',
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
      targets: [{ region: 'forest', x: crash.x - 6, z: crash.z - 3, label: 'Wreckage' }],
    },
  ],
  outro:
    'All survivors are safe. The residue on the engine matches nothing on record — and someone was tracking this flight. The name on the encrypted signal: PROMETHEUS.',
};

export const MISSIONS: Record<string, MissionDef> = { prologue: PROLOGUE };
