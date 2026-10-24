# Known Limitations (Phase 1 + hero/landscape update)

## Not built yet (by design — later phases)

- Flight, hover, super-speed (Phase 3). Normal run is 20 km/h; Shift sprints at 90 km/h (same run, faster).
- Powers, combat, enemies (Phase 6). Left/right mouse are bound but do nothing.
- Missions, saves, save slots, Continue/Load (Phase 7). Free roam only; nothing is saved except settings.
- Intro cinematic / video player, story (Phase 8).
- Audio of any kind (Phase 9). Settings show no audio options until it exists.
- District streaming (Phase 5). The test district (5×5 blocks, ~300 m square) loads at once.
- Gamepad support and key rebinding UI (Phase 2).

## Current shortcomings

- **Hero**: Hatch Superman has only walk/run/fall/idle clips — no jump-start or landing animation, so jumps use `Falling Idle`. Sprint is the same `Running` clip played up to ~5.2× so the feet keep pace at 90 km/h (legs cycle very fast). The primitive placeholder shows briefly while the model loads and if it fails.
- **Cape**: Verlet cloth (8×12 particles) pinned to the chest bone, with capsule colliders for back, head and legs. Arms aren't colliders, so a hand can pass through the cape edge; very fast turns can briefly clip it. No wind yet (still air + speed flutter).
- No flight animation yet; the library's swim loops are kept as a stand-in for Phase 3.
- City art is still a procedural greybox (box buildings, shader windows).
- **Lighting**: areas in building shadow are quite dark; no environment map/reflections; one directional light with a ±45 m shadow area around the player.
- **World boundary** is an invisible wall; there's no in-world explanation.
- Changing **Graphics quality** recreates the renderer and physics world, which respawns the player.
- Camera collision uses one sphere cast; very thin geometry or tight corners can still allow brief near-clipping.
- After Esc, Chrome may refuse to re-capture the mouse for ~1 s; clicking again works.
- The game chunk is 3.3 MB (1.1 MB gzipped), mostly the inlined Rapier WASM; the hero model adds 2.6 MB (loaded after the world).
- Forced-landscape CSS rotation uses portrait safe-area insets, so on notched phones the padding may sit on the wrong edge while rotated. With a real orientation lock (Android) this doesn't apply.
- The `?test` URL flag exposes runtime state on `window.__krypton` for automated tests (harmless, but remove or gate for release).

## Testing gaps

- **No physical mobile device testing has been done.** Touch was verified only in Chrome's touch emulation.
- No real-device performance measurements. The only number (~60 fps) is headless Chrome on a laptop iGPU.
- Mouse-look and pointer-lock behaviour were not testable headless; they need a manual pass.
- Safari and Firefox not tested.

## Local data

Settings live in this browser's localStorage. Clearing site data resets them; they
don't sync across devices. (Same will apply to IndexedDB saves in Phase 7.)
