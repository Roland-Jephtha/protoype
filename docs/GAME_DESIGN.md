# Game Design — Shadow over Metropolis

Status: living document. Phase 1 implements only free-roam ground movement; story
content is built after movement, flight and missions work (Phases 7–8).

## Pillars

1. **Power feels effortless; control is never lost.** Responsive at every speed.
2. **Saving people matters as much as winning fights.** Rescue is a core verb.
3. **Restraint.** Collateral damage and public trust are tracked; brute force has costs.
4. **Cinematic but readable.** Strong camera, clear objectives, no UI clutter.

## Core loop

Explore the city → emergency/mission appears (radio, map marker, visual cue) →
travel (run / super-speed / fly) → resolve (rescue, chase, fight, investigate) →
reward (trust, story progress, ability upgrades) → free roam.

## Player verbs by phase

| Verb | Phase | Notes |
|---|---|---|
| Walk / run / sprint / jump / land | 1 ✅ | Analog walk→run blend, coyote time, jump buffer, variable jump, hard landing |
| Fly: takeoff, hover, cruise, climb, dive, boost, brake, land | 3 | Reference speeds: hover 8, cruise 80, high 250, extreme 500 m/s |
| Super-speed on ground | 3 | Separate controller; collision-safe |
| Heat vision | 6 | Aimed beam, cooldown/heat meter, hit effects, selected interactables |
| Light/heavy melee, knockback | 6 | |
| Lift / carry / throw (selected props, civilians) | 6–7 | |
| Interact / rescue | 7 | Context prompt |

## Progression & campaign state

Saved (Phase 7): chapter, mission, completed/unlocked missions, checkpoint, safe
spawn, unlocked abilities, side missions, story flags, **Public Trust** (0–100;
rises with rescues and minimal damage, falls with collateral damage and failed
rescues — affects NPC reactions and some dialogue).

## Story

**Premise.** A mysterious energy pulse ripples through Metropolis, blacking out the
city and briefly interfering with the hero's powers. Coordinated attacks follow on
energy infrastructure and research facilities. Behind them is **Project
Prometheus**, a classified initiative building technology to predict and suppress
Kryptonian abilities. Its director believes humanity has become dangerously
dependent on one being. To power the project, Prometheus has begun drawing on an
unknown energy source buried beneath the city — and it is destabilizing.

**Themes.** Power vs responsibility · trust vs fear · strength vs restraint ·
saving people is as important as defeating enemies.

### Characters (original; replaceable for a non-fan version)

| Name | Role | Notes |
|---|---|---|
| **The hero** (Superman in the fan build) | Player | Kept behind a swappable character profile |
| **Dr. Helena Voss** | Antagonist; Director of Project Prometheus | Former disaster-response scientist who lost her team when help arrived too late. Believes a city that only waits for a savior can't save itself. Not cruel — certain. Her line she won't cross becomes the final choice. |
| **Kade "Null" Varro** | Recurring enemy; Prometheus field commander | Wears a suppression harness that creates a local power-dampening field; the "impossible enemy" of Chapter 2 |
| **Aegis units** | Enemy type | Prometheus security: drones (Ch.1–2), suppression troopers (Ch.2+), gunships (Ch.4) |
| **Maya Reyes** | Ally; investigative reporter, *Daily Meridian* | Follows the money behind the attacks; mission-giver for investigations |
| **Capt. Dana Okafor** | Ally; Metropolis Emergency Command | Radio voice for rescues; skeptical of relying on the hero, grows to trust them |
| **Dr. Elias Brandt** | Whistleblower; Prometheus engineer | Discovers what the energy source is; must be rescued in Ch.3 |
| **Theo Park** | Ally; young engineer/hacker | Decodes Prometheus signals; light comic relief |

### Campaign outline

- **Prologue — The Night the Lights Went Out.** A pulse blacks out the city; an
  airliner loses power on approach. Teaches movement, flight, rescue, investigation.
  Ends with the hero finding a strange residue at a substation.
- **Chapter 1 — The City's Guardian.** Rescues and infrastructure incidents
  (bridge, tower fire, substation). First theft of experimental tech by Aegis drones.
- **Chapter 2 — The Impossible Enemy.** Pursuits; investigation of Brandt's lab;
  Null's suppression field forces fights without full power.
- **Chapter 3 — The Power Within.** Rescue Brandt; uncover Prometheus and the
  energy source beneath the city; Voss's motives revealed.
- **Chapter 4 — Metropolis Under Siege.** Multiple simultaneous emergencies,
  gunships, district defense; trust and damage matter most here.
- **Chapter 5 — The Last Light.** Infiltrate the Prometheus core, evacuate staff,
  confront Voss, stabilize the source. Resolution depends on restraint, not only force.

## Regions (built: Milestone 1)

Separate regions of a few km each; travel by flying/running off an edge with an exit,
or the pause menu's Travel page. North is -Z.

| Region | Terrain & landmarks | Used for |
|---|---|---|
| **Metropolis** (hub) | City grid, landmark tower, training plaza | City emergencies, siege (Ch.1, Ch.4) |
| **Red Mesa Desert** (east of the city) | Dunes, mesas/buttes, the long canyon, desert highway with pylons, salt pan, **Prometheus test-range base** | Convoy hijack, canyon chase, Null battle, missile site, crater finale |
| **Blackwood Forest** (north of the city) | Wooded hills, river + **dam**, rail line, ranger tower, cabins, **crash site** | Prologue crash rescue, lab under the dam, wildfire, lost hikers |
| Later | Arctic, coast/ocean, mountains | Future chapters |

## Levels (campaign mapped to regions — about two thirds outside the city)

| Chapter | Missions | Region |
|---|---|---|
| Prologue — *The Night the Lights Went Out* | City blackout → Flight 2217 loses power → **guide it down and rescue survivors at the forest crash site** | City → **Forest** |
| 1 — *The City's Guardian* | Tower fire rescue · **desert highway convoy hijack (vehicle pursuit)** · stolen-tech trail to the test range | City, **Desert** |
| 2 — *The Impossible Enemy* | **Canyon chase** · **test-range battle vs Null (power-dampening field)** | **Desert** |
| 3 — *The Power Within* | **Infiltrate the lab under the dam** · rescue Dr. Brandt · first DC villain fight | **Forest** |
| 4 — *Metropolis Under Siege* | City defence vs gunships · **desert missile site** | City, **Desert** |
| 5 — *The Last Light* | **Crater core** · Doomsday boss · Director Voss | **Desert** |
| Side missions | Forest wildfire, lost hikers, river flood at the dam, canyon train derailment, desert sandstorm rescue | **Forest/Desert** |

## Villains

- **DC villains** (fan models the owner downloads from Sketchfab after a licence + origin
  check; suspected game rips are rejected): Doomsday (Ch.5 boss), General Zod & Faora
  (flight duels), Lex Luthor (mech suit), Darkseid, Bizarro, Brainiac, Metallo, Parasite.
- **Original enemies:** Aegis drones and suppression troopers, Prometheus gunships,
  Kade "Null" Varro (power-dampening field), Director Helena Voss.
- Boss patterns (Milestone 4): Doomsday charge/slam, Zod/Faora aerial duels, Lex mech.

## First playable mission (Phase 7–8): "Flight 2217"

Type: rescue. Chapter: prologue. Prereq: intro cinematic seen.

| # | Objective | Success | Failure |
|---|---|---|---|
| 1 | Reach the stricken airliner (waypoint over the district) | Within 60 m | Timer runs out (aircraft too low) → checkpoint |
| 2 | Match speed and stabilize (hold brake/boost to align) | Alignment held 3 s | — (retry) |
| 3 | Guide it down to the forest clearing (Blackwood Forest crash site) | Enters landing zone | Hits terrain hard → checkpoint |
| 4 | Rescue 3 civilians trapped by a blackout-hit tram | All carried to medics | — |
| 5 | Investigate the substation | Interact with residue | — |

Rewards: +10 trust, unlock Chapter 1, autosave. Then free roam.

Other initial mission types: **vehicle pursuit** (stop a stolen tech truck without
wrecking it — damage lowers trust) and **combat/investigation** (clear Aegis drones
from a lab, then scan evidence).

## Intro cinematic storyboard — "The Night the Lights Went Out"

Target 60–75 s. Must be understandable without sound (captions + visual storytelling).

| Shot | Duration | Picture | Sound / caption |
|---|---|---|---|
| 1 | 4 s | Black | Distant city ambience fades in |
| 2 | 8 s | Slow aerial push over Metropolis at dusk, landmark tower centre | Traffic, wind |
| 3 | 6 s | A ripple of distorted light rolls across the skyline from below the city | Low hum rising |
| 4 | 6 s | Windows and street lights go dark block by block | Electrical snaps; silence |
| 5 | 8 s | Emergency radio over dark streets: "Meridian Approach, Flight 2217, we've lost both engines—" | Captioned radio chatter |
| 6 | 8 s | Close shots: civilians lit by phones, a tram stalled, emergency strobes | Sirens |
| 7 | 6 s | An airliner, lights failing, banking low over the river | Engine whine |
| 8 | 6 s | A silhouette rises above the rooftops against the last light | Music swell |
| 9 | 4 s | Title card: **SHADOW OVER METROPOLIS** | Hit |
| 10 | — | Cut to gameplay: player in the air, objective "Reach Flight 2217" | |

Implementation: real `<video>` path (`public/video/intro-cinematic.webm`/`.mp4` +
`.vtt` captions) with play/pause/skip/progress, and an in-engine fallback built from
these shots if the file is missing or playback is blocked (Phase 8).
