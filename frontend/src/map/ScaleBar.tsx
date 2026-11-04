import { useMapScaleStore } from './mapScaleStore';
import { niceScale } from './scale';

// Scale bar computed from the map center (zoom and latitude). With 3D tilt it is only approximate.
export function ScaleBar() {
  const metersPerPx = useMapScaleStore((state) => state.metersPerPx);
  if (metersPerPx === null) return null;
  const { px, label } = niceScale(metersPerPx);
  return (
    <div className="scale-bar" aria-hidden="true">
      <div className="scale-bar-line" style={{ width: `${px}px` }} />
      <span>{label}</span>
    </div>
  );
}
