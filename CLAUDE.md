# CLAUDE.md — Project Krypton conventions

Browser 3D superhero game. TypeScript + React 19 + Vite + three.js + React Three Fiber
+ Drei + Rapier (@react-three/rapier). No backend. See PLAN.md for current phase.

## Commands

```
npm run dev        # dev server (http://localhost:5173)
npm run typecheck  # tsc -b (src + tests)
npm run lint       # oxlint
npm run test       # vitest unit tests (tests/)
npm run build      # typecheck + production build → dist/
npm run preview    # serve dist/
npm run smoke      # browser smoke test of dist/ (run build first; uses local Chrome/Edge)
npm run check      # typecheck + lint + test + build
```
Smoke test env: `CHROME_PATH` (browser), `SMOKE_OUT` (screenshot dir), `SMOKE_GPU=swiftshader` (no GPU).

## Rules

- Work phase by phase (PLAN.md). Keep the game runnable after every change.
- Before claiming done: run `npm run check` and `npm run smoke`, and report real results.
- Never claim mobile/device/perf testing that wasn't done. Chrome touch emulation ≠ device test.
- No unlicensed assets. Every third-party file goes in docs/ASSET_MANIFEST.md first.
- Keep Superman-specific branding out of code identifiers; hero is swappable.
- Don't show UI that does nothing. Add buttons when their feature works.
- Update PLAN.md, docs/KNOWN_LIMITATIONS.md and docs/TEST_PLAN.md each phase.

## Architecture rules

- **All tuning lives in `src/config/`** (movement, camera, physics, graphics, bindings). No magic numbers in gameplay code.
- **React = UI and lifecycle only.** Per-frame data lives in `src/game/runtime.ts` (mutable) — never `setState` per frame. HUD/debug poll at 5–10 Hz.
- **Input**: devices write to `input` (`src/input/InputManager.ts`) per source; gameplay only reads `input`. Presses are latched; consume them in the fixed step.
- **Frame order** (useFrame priorities): physics `-50` → player render publish `-40` → camera `-30` → default `0`. Never use priority > 0 (takes over rendering).
- **Gameplay logic runs in `useBeforePhysicsStep`** at the fixed 1/60 s step. Keep logic in pure classes (e.g. `GroundMotor`) that are unit-testable without Rapier.
- WASM objects (character controllers etc.) are created/freed in `useEffect`, not `useMemo` (StrictMode double-mount frees them).
- Dispose materials/geometries you create in `useEffect` cleanups.
- World scale: 1 unit = 1 m. Yaw 0 looks down -Z. Model forward is +Z.

## Layout

```
src/config/      tuning + bindings
src/input/       InputManager, stick math, keyboard/mouse source
src/state/       zustand stores: app (screens/pause), settings (localStorage)
src/game/        GameCanvas, runtime, player/, camera/, world/
src/ui/          screens, menus, HUD, touch controls
tests/           vitest unit tests
scripts/smoke.mjs  browser smoke test (playwright-core + local Chrome)
docs/            design, architecture, assets, tests, controls, limitations
```

## Environment notes

- Windows dev machine; files may be written with CRLF — `.gitattributes` normalizes to LF.
- When scripting file edits with Python on Windows, always pass `encoding='utf-8'` (default cp1252 corrupts/truncates files).
