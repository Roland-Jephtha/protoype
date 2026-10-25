# Known Limitations (Phase 1 + hero/landscape update)

## Not built yet (by design — later phases)

- Super-speed beyond 90 km/h on foot and flight beyond 150 km/h (the brief's 250/500 m/s tiers) aren't built; the test district is too small for them until streaming exists (Phase 5).
- Combat v1: punches (combo, homing power punch), heat vision, speed dash, super breath, freeze breath and the Super Nova work against drones and villains. Skills don't affect traffic, pedestrians, animals or scenery yet (no destruction), Lifting works on traffic vehicles only (not props, enemies or pedestrians); thrown and dropped vehicles stay as physics wrecks for 25 s, and the car returns to traffic after 40 s. Punches are procedural poses (arm, torso twist, forward lean, a push-off step), not hand-animated. The punch is a procedural arm pose (the hero rigs have no punch clip). Drones fly through buildings/terrain features (none are placed in the city for that reason).
- Campaign: 6 missions (Prologue, Highway Ambush, Doomsday, Zod, Subject Zero, Darkseid). Progress (completed missions) is saved in this browser's localStorage only — no save slots or mid-mission checkpoints yet. Intros are in-engine camera shots with text narration (no recorded video or voice).
- **Installable app**: the service worker caches the game as it's played; the first launch needs a connection. iOS has no install prompt (the title screen shows the Add to Home Screen hint).
- **Audio v1**: all sounds are synthesised in code (Web Audio): flight wind, heat-vision hum, breath, Nova charge and boom, punches, explosions, being hurt, throws, a menace drone near villains and a quiet ambience bed. No music yet, no volume sliders (it pauses with the game), no 3D positioning — everything plays at the same level wherever it happens. Audio starts on the first click/tap/key (browser rule).
- District streaming (Phase 5). The test district (5×5 blocks, ~300 m square) loads at once.
- Gamepad support and key rebinding UI (Phase 2).

## Current shortcomings

- **Hero**: Hatch Superman has only walk/run/fall/idle clips — no jump-start or landing animation, so jumps use `Falling Idle`. Sprint is the same `Running` clip played up to ~5.2× so the feet keep pace at 90 km/h (legs cycle very fast). The primitive placeholder shows briefly while the model loads and if it fails.
- **Cape**: Verlet cloth (8×12 particles) pinned to the chest bone, with capsule colliders for back, head and legs. Arms aren't colliders, so a hand can pass through the cape edge; very fast turns can briefly clip it. No wind yet (still air + speed flutter).
- **Flight**: the collision capsule stays upright while the body flies horizontally, so the head/feet can poke into a wall the capsule hasn't reached. No banking into turns, no flight-specific audio/wind effects, no takeoff/landing animations (hover and fly clips blend). Hovering uses the standing idle.
- City art is still a procedural greybox (box buildings, shader windows).
- **Lighting**: areas in building shadow are quite dark; no environment map/reflections; one directional light with a ±45 m shadow area around the player.
- **Region edges**: edges with an exit travel on (east of the city → desert, north → forest); other edges hold the hero back invisibly (the HUD says "Edge of the region"). Distant scenery continues beyond, but you can't reach it.
- **Desert/forest are v1**: procedural low-poly props (no downloaded nature assets yet), mesa cliffs show saw-tooth aliasing up close, the river has no swimming (you walk on the bed under the water), no ambient audio. Terrain generation runs on the main thread (~0.5 s grid on desktop) behind the loading overlay.
- **Villains v1**: Doomsday and Darkseid (desert), Zod and Subject Zero (forest) wait at fixed lairs and fight when you come close. They move over terrain only: no collision with trees, rocks or buildings, and fliers pass through obstacles. Their animations are the hero's clips retargeted to their rigs (no villain-specific moves; punches are procedural). Being knocked out returns you to the region start point. No saved progress for defeated villains.
- **Life v1**: vehicles never change lanes or turn at intersections (each lane loops end to end, so cars pop back to the start at the map edge, usually out of sight in fog). Pedestrians and animals have no colliders — the hero walks through them (they stop for him, animals flee). Animals move through each other and ignore trees/props; pedestrians only walk block loops (they don't cross streets). The train teleports back to the start after leaving the far end. No street props (benches, hydrants, bus stops) yet. Eagles are 25k-triangle meshes (3 per region).
- **Forest cost**: ~11k instanced trees and colliders on Medium; real-device performance unknown.
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

## Speed Force / hit-stop

World slow-motion scales traffic, life, drones, villains, the train, mission actors and
their animation mixers. Not scaled yet: Rapier rigid bodies (thrown wrecks), particle
effects and procedural audio pitch. Hook/uppercut poses are procedural (two-bone IK),
not motion-captured.
