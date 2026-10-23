# Technical Architecture

## Stack (decided Phase 0)

| Layer | Choice | Why |
|---|---|---|
| Language / build | TypeScript 6, Vite 8 | Fast dev server, code-splitting, typed config |
| UI | React 19 + zustand | Menus/HUD/lifecycle. zustand: tiny, readable outside React (`getState()`), no per-frame renders |
| Rendering | three.js 0.186 + React Three Fiber 9 + Drei 10 | Declarative scene, imperative per-frame hooks |
| Physics | Rapier 0.19 via @react-three/rapier 2 | Kinematic character controller with swept shape casts (anti-tunnelling), auto-step, slopes; shape casts for camera |
| Tests | Vitest (unit), playwright-core + local Chrome (smoke) | No browser download needed |
| Lint | oxlint | Template default, fast |

No backend. Saves: IndexedDB (Phase 7). Settings: localStorage.

## Module map

```
App (screen switch) ──► TitleScreen
                    └─► GameScreen (lazy chunk)
                          ├─ attachKeyboardMouse(root) ─┐
                          ├─ TouchControls ─────────────┤ write ► input (InputManager)
                          ├─ Hud / PauseMenu / Debug    │
                          └─ GameCanvas (R3F)           │
                               ├─ Lighting, Sky, fog    │
                               └─ Physics (fixed 1/60)  │
                                    ├─ TestDistrict (instanced meshes + cuboid colliders)
                                    ├─ Player ◄─ reads input, runtime.cameraYaw
                                    │    GroundMotor (pure) ↔ Rapier KinematicCharacterController
                                    │    writes runtime.player*
                                    └─ ThirdPersonCamera ◄─ reads input look, runtime.playerRenderPosition
                                         writes runtime.cameraYaw/Pitch
```

### Data flow per frame

1. DOM events (any time) → `input` per source (`keyboard`, `mouse`, `touch`, later `gamepad`). Presses latched.
2. R3F frame:
   - **-50 Physics**: for each fixed step: `useBeforePhysicsStep` → `Player` reads `input` + `runtime.cameraYaw` → `GroundMotor.step()` → controller `computeColliderMovement` → `GroundMotor.resolve()` → `setNextKinematicTranslation` → `world.step()`. Then bodies are interpolated.
   - **-40 Player**: publish interpolated render position to `runtime.playerRenderPosition`.
   - **-30 Camera**: drain look input, orbit, follow, sphere-cast collision, set camera.
   - **0** others (lighting follow, perf probe, hero animation), then render.
3. HUD / debug overlay poll `runtime` at 10 Hz / 5 Hz and write DOM text directly.

### State ownership

| State | Owner | Persistence |
|---|---|---|
| Screen, pause, menu page, touch detected | `state/appStore.ts` (zustand) | none |
| Settings | `state/settings.ts` (zustand) | localStorage `krypton.settings.v1`, validated on load |
| Per-frame telemetry | `game/runtime.ts` (mutable object) | none |
| Input | `input/InputManager.ts` singleton | none |
| Campaign (Phase 7) | `save/` module | IndexedDB, versioned schema |

### Key conventions

- 1 unit = 1 m; yaw 0 looks toward -Z; character models face +Z.
- All tuning in `src/config/` (`gameConfig.ts`, `controls.ts`).
- Gameplay logic in plain classes (testable), React components only bridge.
- Resources created in components are disposed in effect cleanups; returning to the title unmounts the Canvas (renderer, physics world, GPU resources released).

## Planned modules (later phases)

| Module | Phase | Sketch |
|---|---|---|
| `game/player/flightMotor.ts`, `speedMotor.ts` | 3 | Same step/resolve contract as GroundMotor; a `MovementMode` state machine selects the active motor. High-speed: sub-step the controller so each cast ≤ capsule radius × N |
| `camera` modes | 3 | Ground / air / hover / dive / extreme-speed profiles in config, blended |
| `world/districts/*` + `world/streaming.ts` | 4–5 | District = manifest (bounds, GLB/instanced data, colliders). Streaming manager: load ring around player + look-ahead along velocity; states `unloaded → loading → ready → unloading`; dedup by id; failure → retry/backoff + invisible safety floor; dispose on unload |
| `assets/manifest.ts` | 4 | Logical ids → URLs, fallbacks; loaders with caching (GLTFLoader + KTX2/meshopt) |
| `combat/`, `powers/` | 6 | Damageable interface, hitscan beam for heat vision, melee hit volumes |
| `missions/` | 7 | Data-driven mission defs (JSON/TS), objective state machine, event bus |
| `save/` | 7 | IndexedDB, 3 slots, schema version + migrations, export/import |
| `cinematic/` | 8 | Video player + in-engine fallback sequencer |
| `audio/` | 9 | WebAudio manager, buses, speed-driven wind |

## Performance strategy

- Instanced geometry: the test district renders in ~75 draw calls.
- Shadow frustum follows the player (±45 m), snapped to avoid shimmer; disabled on Low.
- Quality presets cap DPR (1 / 1.5 / 2), shadows, draw distance (fog).
- Game chunk lazy-loaded after title (title chunk 233 KB; game chunk 3.2 MB / 1.1 MB gzip, mostly Rapier WASM inlined + three.js).
