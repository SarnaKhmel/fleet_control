import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MissionUnit } from '../../../shared/mission/units';
import type { Theme } from '../theme/themeStore';
import { WAYPOINT_COLORS } from './waypointLayer';
import { ENGAGE_COLORS } from './engageLayer';

// Buildings a side holds (infantry walked in): drawn over the map's 3D buildings in the side's color, red for
// the enemy and blue for allies. A position that was destroyed no longer holds its building.
export const HELD_SOURCE_ID = 'held-buildings';
export const HELD_LAYER_ID = 'held-buildings-fill';

// Lifted a little over the map's own building so the two surfaces do not flicker against each other.
const LIFT_M = 1;

const SIDE_COLORS: Record<'enemy' | 'ally', Record<Theme, string>> = { enemy: ENGAGE_COLORS, ally: WAYPOINT_COLORS };

/** GeoJSON with one polygon per building held by a unit on the map that is not destroyed. */
export function heldBuildingFeatures(units: Record<string, MissionUnit>, theme: Theme) {
  const features = [];
  for (const unit of Object.values(units)) {
    if (!unit.building || unit.destroyed) continue;
    const rings = unit.building.rings.map((ring) => {
      const coordinates = ring.map((p) => [p.lng, p.lat]);
      const [first, last] = [coordinates[0], coordinates.at(-1)];
      // A polygon ring must end where it starts.
      return first && last && (first[0] !== last[0] || first[1] !== last[1]) ? [...coordinates, first] : coordinates;
    });
    features.push({
      type: 'Feature',
      properties: { unitId: unit.id, heightM: unit.building.heightM + LIFT_M, color: SIDE_COLORS[unit.side][theme] },
      geometry: { type: 'Polygon', coordinates: rings },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Adds the (empty) source and its extrusion layer. Call it on every style load, like the other layers. */
export function addHeldBuildingsLayer(map: MapLibreMap): void {
  if (map.getSource(HELD_SOURCE_ID)) return;
  map.addSource(HELD_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: HELD_LAYER_ID,
    type: 'fill-extrusion',
    source: HELD_SOURCE_ID,
    paint: {
      'fill-extrusion-color': ['get', 'color'],
      'fill-extrusion-height': ['get', 'heightM'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.9,
    },
  });
}

/** Puts the held buildings into the source added by addHeldBuildingsLayer; does nothing before it exists. */
export function syncHeldBuildings(map: MapLibreMap, units: Record<string, MissionUnit>, theme: Theme): void {
  const source = map.getSource(HELD_SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
  source?.setData?.(heldBuildingFeatures(units, theme));
}
