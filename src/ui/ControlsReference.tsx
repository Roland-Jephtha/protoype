const DESKTOP: [string, string][] = [
  ['W A S D / Arrows', 'Move'],
  ['Mouse', 'Look (click the game to capture the mouse)'],
  ['Space', 'Jump (hold for higher) · again in mid-air: fly · flying: up'],
  ['Shift', 'Sprint (90 km/h) · flying: boost (150 km/h)'],
  ['F', 'Take off / drop out of flight'],
  ['C', 'Flying: down'],
  ['Mouse while flying', 'Look up/down to climb/dive'],
  ['Left mouse', 'Punch (tap quickly for a 3-hit combo)'],
  ['Right mouse (hold)', 'Heat vision: aim with the crosshair'],
  ['Esc / P', 'Pause'],
  ['F3', 'Diagnostics overlay'],
];

const TOUCH: [string, string][] = [
  ['Left stick', 'Move — push further to run'],
  ['Drag right side', 'Look (flying: look up/down to climb/dive)'],
  ['▲ Jump / Up', 'Jump (hold for higher) · flying: up'],
  ['» Sprint / Boost', 'Sprint · flying: boost (hold)'],
  ['✈ Fly / Land', 'Take off / drop out of flight'],
  ['▼ Down', 'Flying: down'],
  ['✊ Punch', 'Punch (tap quickly for a 3-hit combo)'],
  ['◉ Heat (hold)', 'Heat vision — slide your thumb on it to aim'],
  ['❚❚ top-right', 'Pause'],
];

/** Only lists controls that currently work. Powers are added with their phases. */
export function ControlsReference({ onBack }: { onBack: () => void }) {
  return (
    <div className="panel">
      <h2 className="panel-title">Controls</h2>
      <div className="controls-grid">
        <section>
          <h3 className="settings-group">Keyboard & mouse</h3>
          <dl className="controls-list">
            {DESKTOP.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3 className="settings-group">Touch</h3>
          <dl className="controls-list">
            {TOUCH.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <p className="settings-note">More powers (super breath, lifting, dash) arrive in later phases.</p>
      <div className="panel-actions">
        <button type="button" className="menu-btn" onClick={onBack} autoFocus>
          Back
        </button>
      </div>
    </div>
  );
}
