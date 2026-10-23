# Known Limitations (Phase 1)

## Not built yet (by design — later phases)

- Flight, hover, super-speed (Phase 3). Shift is a 16 m/s sprint for now.
- Powers, combat, enemies (Phase 6). Left/right mouse are bound but do nothing.
- Missions, saves, save slots, Continue/Load (Phase 7). Free roam only; nothing is saved except settings.
- Intro cinematic / video player, credits, story (Phase 8).
- Audio of any kind (Phase 9). Settings show no audio options until it exists.
- District streaming (Phase 5). The test district (5×5 blocks, ~300 m square) loads at once.
- Gamepad support and key rebinding UI (Phase 2).

## Current shortcomings

- **Art is placeholder**: procedural primitive hero with procedural animation; box buildings with shader windows. No third-party models yet (see ASSET_MANIFEST.md).
- **Lighting**: areas in building shadow are quite dark; no environment map/reflections; one directional light with a ±45 m shadow area around the player.
- **World boundary** is an invisible wall; there's no in-world explanation.
- Changing **Graphics quality** recreates the renderer and physics world, which respawns the player.
- Camera collision uses one sphere cast; very thin geometry or tight corners can still allow brief near-clipping.
- After Esc, Chrome may refuse to re-capture the mouse for ~1 s; clicking again works.
- The game chunk is 3.2 MB (1.1 MB gzipped), mostly the inlined Rapier WASM.
- The `?test` URL flag exposes runtime state on `window.__krypton` for automated tests (harmless, but remove or gate for release).

## Testing gaps

- **No physical mobile device testing has been done.** Touch was verified only in Chrome's touch emulation.
- No real-device performance measurements. The only number (~60 fps) is headless Chrome on a laptop iGPU.
- Mouse-look and pointer-lock behaviour were not testable headless; they need a manual pass.
- Safari and Firefox not tested.

## Local data

Settings live in this browser's localStorage. Clearing site data resets them; they
don't sync across devices. (Same will apply to IndexedDB saves in Phase 7.)
