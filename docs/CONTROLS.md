# Controls

Only controls that work today are listed as active. Bindings live in
`src/config/controls.ts` (keyed by `KeyboardEvent.code`, so layout-independent).

## Desktop (keyboard + mouse)

| Input | Action | Status |
|---|---|---|
| W A S D / arrow keys | Move (camera-relative) | ✅ |
| Mouse | Look (click the game to capture the mouse; Esc releases) | ✅ |
| Space | Jump — hold for higher, tap for a short hop. Press again in mid-air to take off. In flight: up (hold) | ✅ |
| Shift | Sprint (hold, 90 km/h). In flight: boost to 150 km/h | ✅ |
| F | Take off / drop out of flight | ✅ |
| C | In flight: down (not Ctrl — Ctrl+W closes the tab) | ✅ |
| Mouse (in flight) | Look up/down to climb/dive; flight follows the camera | ✅ |
| Esc / P | Pause / back out of a pause sub-page | ✅ |
| F3 | Diagnostics overlay | ✅ |
| Left mouse | Punch. Locks onto the enemy you aim at (stick/WASD direction, else where the camera looks — white ring), dashes to it and strikes. Taps chain jab → cross → hook → uppercut → heavy finisher; landed hits build the combo counter (every 5th is a super hit) | ✅ |
| Right mouse (hold) | Heat vision through the crosshair (closer camera, meter overheats) | ✅ |
| Hold left mouse, release | Power punch (sends enemies flying) | ✅ |
| R (hold) | Super breath (wind) | ✅ |
| Q (hold) | Freeze breath | ✅ |
| X (hold, release when charged) | Super Nova | ✅ |
| E near a car, street lamp, tree, rock, cactus — or anything thrown earlier | Lift it. Lamps/trees/cacti are one-handed clubs, the rest overhead. Click swings / slams it into enemies, G (touch: Throw) throws it, E drops it | ✅ |
| T | Speed Force: the world slows to a crawl while you move at normal speed (afterimage blur; speedometer ~1000); hold Shift/Boost to go overboard (×2.2, 3000–4000) | ✅ |
| E | Interact / rescue (story mode); lift a nearby vehicle; drop it | ✅ |
| Left mouse while carrying | Throw the vehicle along the crosshair | ✅ |

Losing focus, hiding the tab, or losing pointer lock pauses the game and releases all keys.

**Travel between regions:** pause → *Travel*, or fly/run off a region edge that has an exit (the HUD shows `→ Red Mesa Desert` near it). Leave while flying and you arrive flying.

## Touch (landscape only)

The game is always horizontal on phones. On Play it requests fullscreen + a
landscape lock (works on Android Chrome). Where that isn't possible (iOS Safari)
and the phone is held upright, the whole game is rotated 90° in CSS — just turn
the phone sideways. Toggle: Settings → *Always landscape on phones*.


| Control | Action | Status |
|---|---|---|
| Left analog stick (bottom-left) | 360° analog move; light push = walk, full = run | ✅ |
| Drag anywhere on the right half | Camera look | ✅ |
| ▲ Jump / Up (bottom-right) | Jump (hold for higher). In flight: up (hold) | ✅ |
| » Sprint / Boost | Sprint (hold). In flight: boost to 150 km/h | ✅ |
| ✈ Fly / Land (above Jump) | Take off / drop out of flight | ✅ |
| ▼ Down (flight only) | Fly down (hold) | ✅ |
| ❚❚ (top-right) | Pause | ✅ |
| ✊ Punch | Punch / combo | ✅ |
| ◉ Heat (hold) | Heat vision; slide the thumb on the button to aim, strong aim assist | ✅ |
| ✋ (contextual) | Interact when a prompt shows (story mode) | ✅ |
| Power (≋ / ❄ / ✺ / ⌛) + ⟳ | Hold for Breath / Freeze / Nova, tap Speed to toggle Speed Force; ⟳ cycles the power | ✅ |

Flight: 60 km/h with a full stick, 150 km/h boosting; release everything to brake into a hover; touch any surface while not climbing to land (fast impacts play the heavy landing).

Details: radial dead zone (default 15%, adjustable), response curve exponent 1.4,
knob follows the thumb within its radius, pointer-id tracking for simultaneous stick +
look + buttons, pointer capture, and every end/cancel/lost-capture path returns to
neutral. Safe-area insets respected. Settings: touch look sensitivity, dead zone,
control opacity and size, on-screen controls Auto/On/Off.

## Gamepad

Not implemented yet (Phase 2, optional). Will map into the same `InputManager`.
