const DESKTOP: [string, string][] = [
  ['W A S D / Arrows', 'Move'],
  ['Mouse', 'Look (click the game to capture the mouse)'],
  ['Space', 'Jump (hold for higher)'],
  ['Shift', 'Sprint'],
  ['Esc / P', 'Pause'],
  ['F3', 'Diagnostics overlay'],
];

const TOUCH: [string, string][] = [
  ['Left stick', 'Move — push further to run'],
  ['Drag right side', 'Look'],
  ['▲ button', 'Jump (hold for higher)'],
  ['» button', 'Sprint (hold)'],
  ['❚❚ top-right', 'Pause'],
];

/** Only lists controls that currently work. Powers/flight are added with their phases. */
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
      <p className="settings-note">Flight, super-speed and powers arrive in later phases.</p>
      <div className="panel-actions">
        <button type="button" className="menu-btn" onClick={onBack} autoFocus>
          Back
        </button>
      </div>
    </div>
  );
}
