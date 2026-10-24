# Asset Manifest

Every third-party file must be listed here **before** it is committed: name, creator,
source URL, download date, license, attribution, modifications, path, use.

## Third-party assets in the repo

| Asset | Creator | Source | Downloaded | Licence | Attribution | Modifications | Path | Use |
|---|---|---|---|---|---|---|---|---|
| Universal Animation Library [Standard] — "Mannequin" rig + 18 of 46 clips | Quaternius | https://opengameart.org/content/universal-animation-library (file `universal_animation_librarystandard.zip`, Godot glb) | 2026-10-23 | CC0 1.0 | Not required (credited anyway) | Kept 18 clips, resampled, meshopt-compressed via `scripts/prepare-hero.mjs`; recoloured at runtime into an original super-suit (vertex colours by bone), procedural cape + generic diamond emblem attached to the spine bone | `public/models/hero-ual.glb` (2.6 MB) | Main hero (default) |
| Animated Animals pack — wolf, dog, cat, eagle, piranha (FBX, each with walk/fly/swim + idle clips) | Quaternius | https://opengameart.org/content/animated-animales-low-poly | 2026-10-24 | CC0 1.0 | Not required (credited anyway) | None to the files; at runtime: draw groups merged per material, recoloured by material name (the pack's materials are untextured white), scaled from the animated pose, per-model yaw fix | `public/models/animals/*.fbx` (2.2 MB total) | Wildlife (wolves, coyotes = tinted wolf, eagles, piranhas) and city dogs/cats |

Verified: loads in three.js (smoke test check "rigged hero model loaded"), 1 skin / 53 joints, scaled to 1.9 m, faces +Z, animations play (idle, walk, jog, sprint, jump start/loop/land, crouch).
Regenerate: `node scripts/prepare-hero.mjs "<unzipped>/Godot/AnimationLibrary_Godot_Standard.glb"`.

## "Hatch Superman" — active hero (user-downloaded)

| Field | Value |
|---|---|
| Asset | "Hatch Superman" — textured, Mixamo-rigged (66 joints), 8 clips: `mixamo.com` (idle), Walking, Running, Falling Idle, Flying, Male Dynamic Pose, Walk Strafe Left/Right |
| Creator | nitwit.friends (HatchXR) — https://sketchfab.com/nitwit.friends |
| URL | https://sketchfab.com/3d-models/hatch-superman-e023b533044a4c37a8f899c9517c9804 |
| Downloaded | 2026-10-23 by the product owner (Sketchfab glTF export; file dates 2022-12-26) |
| Licence | CC BY 4.0 — "Author must be credited. Commercial use is allowed." (confirmed in the bundled `license.txt`) |
| Attribution | In-game Credits screen (from `src/config/assets.ts`) + `public/models/hatch-superman/license.txt` |
| Modifications | `scripts/prepare-hatch.mjs`: texture 2048² PNG → 1024² WebP, meshopt compression (4.1 MB → 372 KB); procedural cape attached to `Spine2`; no geometry edits |
| Path | `public/models/hatch-superman/hatch-superman.glb` (raw download kept locally in `/hatch_superman/`, gitignored) |
| Use | Main hero (first in `HERO_MODEL_PRIORITY`); Quaternius hero is the fallback |
| Notes | Animations are Mixamo-sourced, embedded by the model author. The "S" shield is DC's trademark — acceptable for this non-commercial fan prototype, must be replaced for any original/commercial version. The `Flying` clip is reserved for Phase 3. Locomotion clips verified in-place (no root motion). |

Regenerate: `node scripts/prepare-hatch.mjs hatch_superman` (add `--inspect` to list clips).

Other Sketchfab "Superman" uploads were reviewed and **rejected** because they appear
to be re-uploaded game rips under licences the uploader can't grant: "Superman |
MultiVersus" (King_45), "Injustice 2 | DCEU collection" (kanimator), and 3dworldz's
"Superman Man of Steel" / "Superman (Textured)(Rigged)" (match commercial game skins).

## Original (code-generated) assets

Regions (Milestone 1) use no third-party files: terrain (seeded noise), rocks, cacti, scrub, conifer/broadleaf trees (procedural low-poly with vertex colours, `src/game/world/propGeometries.ts`), the highway, rail line, river surface, dam, ranger tower, cabins, crash-site wreckage and the Prometheus base are all generated in code. So are the vehicles (sedan, taxi, van, pickup, bus, semi — `src/game/vehicles/vehicleGeometry.ts`), traffic lights, the forest road and the freight train (`src/game/vehicles/Train.tsx`). City pedestrians reuse the CC0 Quaternius mannequin above with per-person outfit colours. Downloaded CC0 nature kits (Kenney/Quaternius) are a planned upgrade.

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
