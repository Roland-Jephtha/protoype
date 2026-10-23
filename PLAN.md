# PLAN — Project Krypton: Shadow over Metropolis

_Last updated: 2026-10-23_

## Current phase

**Phase 1 — Playable foundation: COMPLETE (pending your hands-on playtest).**
Next: **Phase 2 — Real mobile & desktop controls.**

## Starting state (Phase 0 inspection, 2026-10-23)

The repository directory was **completely empty** (no files, no git repo). Nothing
existed to preserve. Tooling found: Node 25.7.0, npm 11.10.1, git 2.51, Chrome and
Edge installed (used for automated browser tests). The project was scaffolded with
`create-vite` (react-ts template); its demo files were removed.

## MVP definition (vertical slice target, end of Phase 8)

Title screen → save slot → intro cinematic (video path + in-engine fallback) →
prologue rescue mission in one district with ground movement, flight and
super-speed → mission complete → autosave → free roam. Desktop and touch.

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 Inspection & plan | ✅ Done | Docs created; stack chosen (see TECHNICAL_ARCHITECTURE.md) |
| 1 Playable foundation | ✅ Done | See acceptance below |
| 2 Real mobile & desktop controls | ⏭ Next | Shell already functional; needs hardening, tuning, gamepad optional |
| 3 Flight & super-speed | ☐ | |
| 4 First city district | ☐ | Phase 1 test district is a procedural greybox |
| 5 Streaming | ☐ | |
| 6 Powers & combat | ☐ | |
| 7 Missions & saves | ☐ | |
| 8 Story vertical slice | ☐ | |
| 9 Content & polish (incl. asset sourcing) | ☐ | Asset research can start earlier, see ASSET_MANIFEST.md |
| 10 Release candidate | ☐ | |

## Phase 1 acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| App starts locally | ✅ | `npm run dev`, `npm run preview` |
| A 3D scene renders | ✅ | Smoke test screenshots; 75 draw calls in test district |
| Placeholder hero walks, runs, jumps, lands | ✅ | Unit tests (`groundMovement.test.ts`) + smoke test (run 8 m/s, jump +2.25 m, lands) |
| Camera control works | ✅ | Mouse (pointer lock) + touch look pad; smoke test verifies touch yaw change. Mouse-look needs a human (pointer lock can't be automated headless) |
| Basic collision works | ✅ | Rapier character controller; smoke test shows player stopped by stairs/platform; auto-step on 0.4 m steps |
| Keyboard/mouse controls work | ✅ | Smoke test: W, Space, Shift, Esc |
| Mobile UI shell and input abstraction exist | ✅ | Functional stick, look pad, jump, sprint, pause; multi-touch verified in Chrome touch emulation (not on a physical device) |
| Pause menu works | ✅ | Smoke test: open, settings, Esc-back, restart checkpoint, return to title, re-enter |
| Production build passes | ✅ | `npm run build` |

## Phase 2 — next tasks

1. Physical-device touch testing (iOS Safari, Android Chrome) — **needs you**; record results in docs/TEST_PLAN.md.
2. Floating vs fixed stick option; stick re-centre on touch-down inside a larger capture zone.
3. Look-pad acceleration curve and per-axis sensitivity; optional gyro (later).
4. Action button layout config (size/position presets), left-handed mirror option.
5. Gamepad API source (`input/gamepad.ts`) mapping to the same `InputManager`.
6. Key rebinding UI (bindings are already centralized in `config/controls.ts`).
7. Debug overlay: on-screen touch point visualization.
8. Automated: extend `scripts/smoke.mjs` with pointer-cancel during camera drag, rapid tap spam, orientation change mid-touch.

Phase 2 acceptance criteria are in the brief and repeated in docs/TEST_PLAN.md.

## Blockers / decisions needed

- None blocking. Two open questions for the product owner (sensible defaults chosen):
  1. **Git**: the folder is not a repository. Recommend `git init` before Phase 2 so each phase is a reviewable commit. Not done without your approval.
  2. **Hero art direction**: legally, a licensed Superman model is unlikely to be available; plan is an original, swappable hero (see ASSET_MANIFEST.md). Confirm you're OK with "Superman-inspired original" visuals for any public build.

## Major technical risks

| Risk | Mitigation / test |
|---|---|
| Tunnelling at 250–500 m/s flight | Rapier shape-cast character controller already sweeps; Phase 3 adds sub-stepping for very high speed + tests flying into buildings at max speed |
| Mobile GPU performance | Instanced geometry, quality presets, DPR caps; measure on real devices in Phase 4 |
| Streaming hitches | Phase 5: async chunk loading, idle-time GPU uploads, diagnostics |
| Pointer lock / autoplay restrictions | Lock requested only in user gestures; intro video starts from Start click (Phase 8) |
| Legal asset availability | Original/CC0 assets only; manifest tracks every file |
| 3.2 MB game chunk (Rapier WASM inlined + three.js) | Game chunk lazy-loaded after title; consider non-compat Rapier build (separate .wasm) in Phase 9 |
