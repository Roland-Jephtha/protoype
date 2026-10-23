# Controls

Only controls that work today are listed as active. Bindings live in
`src/config/controls.ts` (keyed by `KeyboardEvent.code`, so layout-independent).

## Desktop (keyboard + mouse)

| Input | Action | Status |
|---|---|---|
| W A S D / arrow keys | Move (camera-relative) | ✅ |
| Mouse | Look (click the game to capture the mouse; Esc releases) | ✅ |
| Space | Jump — hold for higher, tap for a short hop | ✅ |
| Shift | Sprint (hold) | ✅ (flight boost in Phase 3) |
| Esc / P | Pause / back out of a pause sub-page | ✅ |
| F3 | Diagnostics overlay | ✅ |
| Left mouse | Primary attack / heat vision | Phase 6 (bound, no effect yet) |
| Right mouse | Aim / focus | Phase 6 (bound, no effect yet) |
| E | Interact / rescue | Phase 7 |
| Q | Power selection | Phase 6 |

Losing focus, hiding the tab, or losing pointer lock pauses the game and releases all keys.

## Touch (landscape only)

The game is always horizontal on phones. On Play it requests fullscreen + a
landscape lock (works on Android Chrome). Where that isn't possible (iOS Safari)
and the phone is held upright, the whole game is rotated 90° in CSS — just turn
the phone sideways. Toggle: Settings → *Always landscape on phones*.


| Control | Action | Status |
|---|---|---|
| Left analog stick (bottom-left) | 360° analog move; light push = walk, full = run | ✅ |
| Drag anywhere on the right half | Camera look | ✅ |
| ▲ Jump (bottom-right) | Jump (hold for higher) | ✅ |
| » Sprint | Sprint (hold) | ✅ |
| ❚❚ (top-right) | Pause | ✅ |
| Flight up/down, boost, attack, heat vision, interact | — | Added with their phases |

Details: radial dead zone (default 15%, adjustable), response curve exponent 1.4,
knob follows the thumb within its radius, pointer-id tracking for simultaneous stick +
look + buttons, pointer capture, and every end/cancel/lost-capture path returns to
neutral. Safe-area insets respected. Settings: touch look sensitivity, dead zone,
control opacity and size, on-screen controls Auto/On/Off.

## Gamepad

Not implemented yet (Phase 2, optional). Will map into the same `InputManager`.
