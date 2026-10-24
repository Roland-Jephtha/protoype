# Test Plan

Test categories are kept separate and reported honestly:
**automated unit**, **automated browser (emulated)**, **manual desktop**,
**manual mobile emulation**, **physical device**.

## Automated

| Command | What | Phase 1 result (2026-10-23) |
|---|---|---|
| `npm run typecheck` | tsc over src + tests | ✅ pass |
| `npm run lint` | oxlint | ✅ 0 warnings, 0 errors |
| `npm run test` | 54 vitest tests: ground contact integration (real Rapier controller + GroundMotor + depenetration/snap: sidewalk rest height, walk/run/sprint off a curb never sinks or flickers airborne, jumping still works), stick math, input manager (latching, multi-source, release), ground motor (accel/decel, jump height, variable jump, coyote, buffer, hard landing, wall bleed, facing), settings sanitization/corruption, city layout (determinism, no overlaps, spawn clear), camera math, hero clip mapping | ✅ 54/54 (2026-10-24) |
| `npm run build` | production build | ✅ pass (chunk-size warning for game chunk, expected) |
| `npm run smoke` | 33 browser checks on the production build in headless Chrome (desktop + touch emulation + portrait phone via CDP) | ✅ 33/33 (2026-10-24) |

Smoke checks: title renders · world loads, player grounded · W moves forward · run
speed · decelerates · jump +2.25 m · lands · pause opens · sim frozen while paused ·
settings · Esc back · restart checkpoint · sprint >20 m/s (90 km/h target) · run animation stays fully applied through the sprint (no fade to rest pose) · return to title · re-enter ·
no page errors · touch: controls shown · analog diagonal · move + look simultaneously ·
jump during move + look (3 fingers) · touchend releases jump · stick neutral ·
touchcancel releases stick + sprint · touch pause button · no page errors.

**Limits of the smoke test:** Chrome touch emulation, not a phone. Pointer-lock
mouse-look can't be exercised headless. CDP can't lift one finger independently
(only all), so single-finger release is verified by unit tests + manual testing.

## Manual desktop checklist (needs a human)

- [ ] Click canvas → mouse captured; look feels smooth, no jitter; pitch stops at limits
- [ ] Esc → pause; Resume re-captures mouse (Chrome may require a second click if within ~1 s)
- [ ] Walk up the stairs (no jump needed), ramp, 0.4 m crate (auto-step)
- [ ] Jump onto 1 m and 2 m crates; 3.5 m crate needs the stepping blocks
- [ ] Climb stepping blocks to the 12 m pillar; jump off → heavy "Impact" landing
- [ ] Back the camera into a wall/building → camera pulls in, no clipping; eases back out
- [ ] Sprint down a street; camera pulls back + slight FOV widen; Reduced motion lessens it
- [ ] Alt-tab while holding W → game pauses, no stuck movement on return
- [ ] Settings persist after reload; Graphics Low/Medium/High change visibly
- [ ] Window resize / different aspect ratios

## Manual mobile checklist — physical device (NOT yet performed)

- [ ] iOS Safari (landscape): stick, look, jump, sprint together; no page scroll/zoom/selection
- [ ] Android Chrome (landscape): same
- [ ] Notch / rounded corners: controls clear of safe areas
- [ ] Incoming notification / app switch mid-hold → nothing stuck on return
- [ ] Portrait → rotate prompt; "Continue in portrait" works
- [ ] Frame rate on a mid-range phone at Medium and Low (record device + numbers here)

## Performance

Baseline (not a benchmark): headless Chrome on Intel HD 620 laptop GPU, 1280×720,
Medium preset → ~60 fps, 75 draw calls. Real-device numbers: **not yet measured**.

## Phase 2 acceptance (next)

Left stick 360° · right look · simultaneous · action buttons with feedback · touch
cancel never sticks · safe-area landscape layout · keyboard/mouse still work ·
control-debug overlay · document touch testing not performed.
