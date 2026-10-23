import { useSettings, type Settings } from '../state/settings';

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function Slider({ k, label, min, max, step, format }: { k: NumKey; label: string; min: number; max: number; step: number; format?: (v: number) => string }) {
  const value = useSettings((s) => s[k]);
  const set = useSettings((s) => s.set);
  return (
    <label className="setting-row">
      <span className="setting-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(k, Number(e.target.value))} />
      <span className="setting-value">{format ? format(value) : value.toFixed(2)}</span>
    </label>
  );
}

function Toggle({ k, label }: { k: BoolKey; label: string }) {
  const value = useSettings((s) => s[k]);
  const set = useSettings((s) => s.set);
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <button type="button" role="switch" aria-checked={value} className={`toggle ${value ? 'on' : ''}`} onClick={() => set(k, !value)}>
        {value ? 'On' : 'Off'}
      </button>
    </div>
  );
}

function Choice<K extends 'touchControls' | 'graphicsQuality'>({ k, label, options }: { k: K; label: string; options: { value: Settings[K]; label: string }[] }) {
  const value = useSettings((s) => s[k]);
  const set = useSettings((s) => s.set);
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => set(k, o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const mult = (v: number) => `${v.toFixed(1)}×`;

/** Settings shared by the title screen and pause menu. Every control is live and persisted. */
export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const reset = useSettings((s) => s.reset);
  return (
    <div className="panel settings-panel">
      <h2 className="panel-title">Settings</h2>
      <div className="settings-scroll">
        <h3 className="settings-group">Camera</h3>
        <Slider k="cameraSensitivity" label="Mouse sensitivity" min={0.2} max={3} step={0.1} format={mult} />
        <Slider k="touchLookSensitivity" label="Touch look sensitivity" min={0.2} max={3} step={0.1} format={mult} />
        <Toggle k="invertY" label="Invert vertical look" />

        <h3 className="settings-group">Touch controls</h3>
        <Choice
          k="touchControls"
          label="On-screen controls"
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
        <Slider k="stickDeadZone" label="Stick dead zone" min={0} max={0.5} step={0.01} format={pct} />
        <Slider k="touchControlOpacity" label="Control opacity" min={0.2} max={1} step={0.05} format={pct} />
        <Slider k="touchControlScale" label="Control size" min={0.75} max={1.4} step={0.05} format={pct} />
        <Toggle k="forceLandscape" label="Always landscape on phones" />

        <h3 className="settings-group">Graphics & accessibility</h3>
        <Choice
          k="graphicsQuality"
          label="Quality"
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
        />
        <Toggle k="reducedMotion" label="Reduced motion" />
        <Toggle k="showDebug" label="Diagnostics overlay (F3)" />
        <p className="settings-note">Audio settings will appear when audio is added. Settings are stored in this browser only.</p>
      </div>
      <div className="panel-actions">
        <button type="button" className="menu-btn secondary" onClick={reset}>
          Reset defaults
        </button>
        <button type="button" className="menu-btn" onClick={onBack} autoFocus>
          Back
        </button>
      </div>
    </div>
  );
}
