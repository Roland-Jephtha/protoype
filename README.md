# Project Krypton: Shadow over Metropolis

A browser-based 3D open-world superhero game prototype (non-commercial fan project).
TypeScript · React · Vite · three.js · React Three Fiber · Rapier.

**Status:** Phase 1 — playable foundation. See [PLAN.md](PLAN.md).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build and checks:

```bash
npm run check      # typecheck + lint + unit tests + build
npm run smoke      # headless-browser smoke test of dist/ (needs Chrome or Edge installed)
npm run preview    # serve the production build
```

To test on a phone on the same Wi-Fi: `npm run dev -- --host`, then open the printed
network URL on the phone.

## Docs

- [PLAN.md](PLAN.md) — phases, status, next tasks
- [CLAUDE.md](CLAUDE.md) — conventions for contributors / Claude Code
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — story, characters, missions, storyboard
- [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md)
- [docs/CONTROLS.md](docs/CONTROLS.md)
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md)
- [docs/ASSET_MANIFEST.md](docs/ASSET_MANIFEST.md)
- [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md)

_Not affiliated with or endorsed by DC Comics or Warner Bros. Superman is a trademark of DC Comics._
