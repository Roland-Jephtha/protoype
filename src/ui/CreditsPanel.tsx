import { HERO_MODELS } from '../config/assets';

/** Credits and attributions (required by CC BY assets). Driven by config/assets.ts. */
export function CreditsPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="panel">
      <h2 className="panel-title">Credits</h2>
      <div className="settings-scroll">
        <h3 className="settings-group">Project</h3>
        <p className="panel-text">Project Krypton: Shadow over Metropolis — non-commercial fan prototype.</p>
        <h3 className="settings-group">Characters & animation</h3>
        <ul className="credits-list">
          {Object.values(HERO_MODELS).map((m) => (
            <li key={m.id}>{m.credit}</li>
          ))}
        </ul>
        <h3 className="settings-group">Villains</h3>
        <ul className="credits-list">
          <li>Superman (Injustice 2, BvS suit) from the Injustice 2 | DCEU collection by kanimator (sketchfab.com/kanimator), original models by DatKofGuy and Carinhaqualquer — CC BY 4.0</li>
          <li>General Zod model by DavidA3D (sketchfab.com/DavidA3D) — CC BY-NC 4.0</li>
          <li>Darkseid (DC Legends, rigged and animated) by 3dworldz (sketchfab.com/3dworldz) — CC BY 4.0</li>
          <li>Doomsday by 3dmanx888 (sketchfab.com/3dmanx888) — CC BY 4.0</li>
        </ul>
        <h3 className="settings-group">Wildlife</h3>
        <ul className="credits-list">
          <li>Animated animals (wolf, dog, cat, eagle, piranha) by Quaternius — CC0</li>
        </ul>
        <h3 className="settings-group">Software</h3>
        <p className="panel-text">three.js, React Three Fiber, Drei, Rapier, React, Vite (MIT / Apache-2.0).</p>
        <p className="settings-note">
          Superman is a trademark of DC Comics. This project is not affiliated with or endorsed by DC Comics or Warner Bros.
        </p>
      </div>
      <div className="panel-actions">
        <button type="button" className="menu-btn" onClick={onBack} autoFocus>
          Back
        </button>
      </div>
    </div>
  );
}
