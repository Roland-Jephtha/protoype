# Asset Manifest

Every third-party file must be listed here **before** it is committed: name, creator,
source URL, download date, license, attribution, modifications, path, use.

## Current assets (Phase 1)

**No third-party assets are used.** Everything visible is generated in code:

| Asset | Type | Source | License | Path |
|---|---|---|---|---|
| Placeholder hero | Procedural primitives + procedural animation | Original (this project) | Project-owned | `src/game/player/PlaceholderHero.tsx` |
| Chest emblem | Two rotated boxes (generic diamond) | Original — deliberately **not** a licensed logo | Project-owned | same |
| Test district buildings, streets, lamps | Instanced boxes, seeded layout | Original | Project-owned | `src/game/world/` |
| Building windows | Procedural shader pattern | Original | Project-owned | `src/game/world/buildingMaterial.ts` |
| Sky | Drei `<Sky>` (Preetham model, code) | @react-three/drei (MIT) | MIT | npm dependency |
| Title skyline | CSS gradients | Original | Project-owned | `src/styles/global.css` |
| Favicon | Vite template SVG | Vite (MIT) | MIT | `public/favicon.svg` — replace with a project icon |

No network downloads were attempted in Phase 1.

## Rejected assets (do not use)

| Asset | Location | Why rejected |
|---|---|---|
| "Superman (Man of Steel)" model + textures (OBJ/PNG) | `Mobile - Injustice_ Gods Among Us - .../` (local only, gitignored) | Extracted from *Injustice: Gods Among Us* (WB Games / NetherRealm). Copyrighted game asset, no licence to redistribute. Also static OBJ with no rig or animations. |
| "Superman" model + textures (OBJ/PNG) | `Xbox - Superman Returns - .../` (local only, gitignored) | Extracted from *Superman Returns* (EA, Xbox). Same reasons. |

Both folders are excluded by `.gitignore` and must never be committed, bundled into `dist/`, or deployed.

## Branding note

"Superman", the S-shield, and related names/likenesses are trademarks/copyrights of
DC Comics / Warner Bros. This is a non-commercial fan prototype. **No official logos,
film/game footage, music, or ripped assets may be used.** Keep the hero behind a
swappable profile so the project can become an original superhero.

## Sourcing plan (to execute from Phase 4, required by Phase 9)

Licences must be re-checked per asset at download time — the notes below are what
each source generally offers, not a verified clearance of any specific file.

| Need | Candidate sources | Licence to verify | Notes |
|---|---|---|---|
| Rigged humanoid hero base + animations | Quaternius (quaternius.com) "Universal Animation Library" / character packs; Kenney (kenney.nl) characters | Typically CC0 | Restyle into an original caped hero (suit material, cape mesh). Check skeleton compatibility for retargeting |
| Animations (flight poses, punches) | Quaternius animation library; Mixamo | Quaternius: CC0. **Mixamo: Adobe terms — check redistribution rules for web builds** before use | Hover/flight poses likely need custom keyframing in Blender |
| Civilians / police / workers / scientists | Quaternius, Kenney "Mini characters", Sketchfab CC0/CC-BY | CC0 / CC-BY (attribution in credits) | Vary materials/colours/scale to avoid clones |
| City buildings / props | Kenney "City Kit", Quaternius city packs | CC0 | Mix with procedural towers for scale |
| Textures (asphalt, concrete, glass) | Poly Haven, ambientCG | CC0 | Compress to KTX2 |
| HDRI sky / environment | Poly Haven | CC0 | Dusk HDRI for reflections |
| SFX (wind, impacts, sirens, UI) | Kenney audio packs, freesound.org (filter CC0) | CC0 / CC-BY per file | Track each file's licence individually |
| Music | Original commission or CC0/CC-BY tracks with clear licence | Per track | No film scores |
| Intro video | Rendered in-engine (original) | Project-owned | Never use film footage |
| UI icons | Original SVG; game-icons.net | CC-BY 3.0 (attribution) | |

Workflow per asset: download into a fresh folder → inspect → verify licence page →
add row here → optimize (gltf-transform: meshopt/KTX2) → load test (scale, orientation,
materials, rig, animations, shadows) → commit.
