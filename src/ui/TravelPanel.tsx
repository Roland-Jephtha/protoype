import { REGION_ORDER, REGIONS } from '../config/regions';
import { useApp } from '../state/appStore';

/** Pause-menu world map: jump to any region (arrives at its spawn). */
export function TravelPanel({ onBack }: { onBack: () => void }) {
  const current = useApp((s) => s.regionId);
  const travelTo = useApp((s) => s.travelTo);
  return (
    <div className="panel">
      <h2 className="panel-title">Travel</h2>
      <nav className="menu-list travel-list">
        {REGION_ORDER.map((id) => {
          const r = REGIONS[id];
          const here = id === current;
          return (
            <button key={id} type="button" className="menu-btn travel-btn" disabled={here} onClick={() => travelTo(id)}>
              <span className="travel-name">
                {r.name}
                {here && <em> · you are here</em>}
              </span>
              <span className="travel-desc">{r.description}</span>
            </button>
          );
        })}
      </nav>
      <p className="settings-note">You can also fly or run off the edge of a region toward a neighbouring one.</p>
      <div className="panel-actions">
        <button type="button" className="menu-btn" onClick={onBack} autoFocus>
          Back
        </button>
      </div>
    </div>
  );
}
