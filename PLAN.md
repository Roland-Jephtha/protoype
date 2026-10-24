# PLAN — Project Krypton: Shadow over Metropolis

_Last updated: 2026-10-24_

## Where we are

| Done | Notes |
|---|---|
| Phase 0–1: foundation | App shell, input (keyboard/mouse/touch), camera, pause/settings, tests |
| Hero | Hatch Superman (CC BY 4.0) with cloth cape; CC0 Quaternius fallback |
| Movement | Walk, run 20 km/h, sprint 90 km/h; exact ground contact (depenetration + snap); vsync frame loop (no judder) |
| Flight | 60 km/h base, 150 km/h boost, hover, climb/dive by camera, landing |
| Mobile | Landscape-only, analog stick, look pad, Fly/Up/Down/Boost buttons |
| **Milestone 1: regions** | **Red Mesa Desert + Blackwood Forest + Metropolis**, travel via pause menu or flying off an edge (see below) |
| Story mode | Title → Story mode / Free roam; prologue mission (fly north, find the crash, rescue 3 survivors, investigate the wreck) |
| **Milestone 2: life** | City traffic with working lights, pedestrians, dogs and cats; desert highway traffic, coyotes, eagles; forest road traffic, a raceable freight train, wolves, eagles, leaping piranhas |

Roadmap (approved 2026-10-24, owner wants most action outside the city):

| # | Milestone | Status |
|---|---|---|
| 1 | Region system + desert + forest | ✅ v1 done (2026-10-24) |
| 2 | City life: pedestrians, traffic + lights, street props; wildlife/convoys outdoors | ✅ v1 done (2026-10-24) — street props still to add |
| 3 | Combat: heat vision, punches, lift/throw, health, enemy AI (drones, soldiers) | 🔶 In progress — heat vision, punch combo, health/heat HUD, drones done |
| 4 | Villains: DC models the owner downloads (licence-checked) + original henchmen, boss AI | ☐ |
| 5 | Missions + IndexedDB saves (3 slots, autosave, versioned) | ☐ |
| 6 | Campaign levels (prologue → chapter 5, side missions) — mostly desert/forest | ☐ |
| 7 | Presentation: intro cinematic (video + in-engine fallback), briefings, results | ☐ |
| 8 | Flight polish + audio (banking, capsule orientation, wind, ambience, music) | ☐ |
| 9 | Release candidate: device testing, performance, deploy docs | ☐ |

The level/region plan and villain roster are in docs/GAME_DESIGN.md.

## Milestone 1 — what was built

- `src/config/regions.ts` — region definitions (look, terrain parameters, exits, entry points). Desert lies **east** of the city, forest **north**.
- `src/game/world/terrainNoise.ts` — seeded height functions: dunes, mesas (calibrated so `mesaCoverage` ≈ map fraction), carved canyon and river, highway/rail bands that cut through terrain, flat sites.
- `src/game/world/Terrain.tsx` — 4×4 chunk meshes + Rapier heightfield from one grid with identical triangulation (**collision matches the visible ground to < 1 mm**, unit-tested), biome colouring + detail shader, distant scenery ring and edge skirt.
- Desert: highway + pylons, rocks, boulders, cacti, scrub, Prometheus test-range base. Forest: ~11k trees (medium quality) with trunk colliders, river surface, rail line, dam, ranger tower, cabins, crash site.
- Travel: pause menu → Travel, or fly/run off an edge with an exit (arrive flying if you left flying); edges without exits hold the hero back. HUD shows region name + edge hint.

Acceptance (all verified by `npm run smoke`, 47/47, three consecutive runs): both regions load from the Travel menu (~2–5 s headless), running/sprinting keeps feet on the terrain (min sole ≥ 0 cm), flight + landing on terrain, flying off the forest edge arrives in Metropolis still flying, no page errors.

## Milestone 2 — what was built

- `src/game/vehicles/traffic.ts` (pure, unit-tested): lane following, safe gaps, stopping at red/yellow, braking for the hero standing in the lane (not when flying over).
- City: two lanes per street, stop lines at every intersection, an 18 s light cycle (X streets / Z streets) with poles on every corner. Desert highway and the new forest road carry open-road traffic. Every vehicle has a kinematic collider.
- Forest road: two lanes from the city arrival to the west edge, flattened into the terrain, kept clear of the railway (no level crossing).
- Freight train: locomotive + 6 wagons at 86 km/h along the rail line, cars bend through the curve, kinematic colliders. Running alongside announces the race; passing it 60 m ahead shows "You beat the train!" (sprint can keep up; flight wins).
- Life (`src/game/life/`): pure behaviours (sidewalk loops, wander/flee, circling, river patrol; unit-tested). Pedestrians walk block loops (keep right, wait for the hero), dogs and cats wander the sidewalks, wolf packs/coyotes roam and scatter when the hero lands near them, eagles circle, piranhas leap out of the river.
- Travel can target an exact point (`travelTo(id, { at })`) and always remounts the region (travelling to the current region used to hang on the loading screen).

Acceptance: `npm run smoke` 64/64 (adds traffic flowing and queuing at reds, pedestrians walking, animals present, train moving, train race announced and won).

## Bugs found and fixed during Milestone 1

- Rapier "unreachable" panic: the player's body was rebuilt on every UI re-render (new position array each render) and removed twice. Position memoised; `RegionWorld` memoised.
- Same panic on travel: static colliders were removed from an already torn-down world. Guarded like @react-three/rapier does.
- Road/rail strips faced downward (culled from above); fixed + unit test.
- Mesas never appeared (threshold outside the noise range); recalibrated from the measured distribution.

## Blockers / decisions needed

- None blocking. Physical-device testing (iPhone/Android) still needs the owner.

## Major technical risks

| Risk | Mitigation / test |
|---|---|
| Mobile GPU/CPU cost of forests (11k trees, ~1.1M tris on Medium) | Quality presets scale density 0.4/0.7/1.0; group culling by distance; needs real-device numbers |
| Terrain generation time on phones (~0.5 s desktop for the grid) | Behind the loading overlay; move to a Web Worker if devices are slow |
| Mesa cliffs alias on the 4–9 m grid (saw-teeth) | Softer transitions now; later: local refinement or cliff meshes |
| Legal asset availability (villains) | Licence + origin check per model before download; manifest + credits |
| 3.3 MB game chunk (Rapier WASM inlined + three.js) | Lazy-loaded after title; consider non-compat Rapier build |
