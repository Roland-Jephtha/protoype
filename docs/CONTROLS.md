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
| Left mouse | Punch; quick taps chain a 3-hit combo, the third knocks enemies flying | ✅ |
| Right mouse (hold) | Heat vision through the crosshair (closer camera, meter overheats) | ✅ |
| Hold left mouse, release | Power punch (sends enemies flying) | ✅ |
| V | Speed dash | ✅ |
| R (hold) | Super breath (wind) | ✅ |
| Q (hold) | Freeze breath | ✅ |
| X (hold, release when charged) | Super Nova | ✅ |
| E | Interact / rescue (story mode) | ✅ |

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
| ⇥ Dash | Speed dash | ✅ |
| Power (≋ / ❄ / ✺) + ⟳ | Hold for Breath / Freeze / Nova; ⟳ cycles the power | ✅ |

Flight: 60 km/h with a full stick, 150 km/h boosting; release everything to brake into a hover; touch any surface while not climbing to land (fast impacts play the heavy landing).

Details: radial dead zone (default 15%, adjustable), response curve exponent 1.4,
knob follows the thumb within its radius, pointer-id tracking for simultaneous stick +
look + buttons, pointer capture, and every end/cancel/lost-capture path returns to
neutral. Safe-area insets respected. Settings: touch look sensitivity, dead zone,
control opacity and size, on-screen controls Auto/On/Off.

## Gamepad

Not implemented yet (Phase 2, optional). Will map into the same `InputManager`.
