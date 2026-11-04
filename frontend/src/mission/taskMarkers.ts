import type { Map as MapLibreMap, Marker as MapLibreMarkerType } from 'maplibre-gl';
import { Marker } from 'maplibre-gl';
import i18n from 'i18next';
import type { DroneView } from './missionStore';
import { removeDroneTask, updateDroneTask } from './missionSocket';

// Task points of the selected drones, numbered in flight order. Drag a point to move the task there;
// right-click it to drop the task. The server answers with the new list, which moves the markers.
// The tasks of a drone that lost its link stay on view but are locked: it takes no more commands.

interface Entry {
  map: MapLibreMap;
  marker: MapLibreMarkerType;
  dragging: boolean;
  locked: boolean;
}

// One marker per drone and task index, reused across updates so a drag in progress is not interrupted.
const entries = new Map<string, Entry>();

function createEntry(map: MapLibreMap, droneId: string, callsign: string, index: number, locked: boolean): Entry {
  const el = document.createElement('div');
  el.className = locked ? 'task-marker is-locked' : 'task-marker';
  el.textContent = String(index + 1);
  el.setAttribute('aria-label', i18n.t('drone.taskMarker', { callsign, n: index + 1 }));
  const marker = new Marker({ element: el, anchor: 'center', draggable: !locked });
  const entry: Entry = { map, marker, dragging: false, locked };
  if (locked) return entry;
  el.title = i18n.t('drone.taskMarkerHint');
  el.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    removeDroneTask(droneId, index);
  });
  marker.on('dragstart', () => {
    entry.dragging = true;
  });
  marker.on('dragend', () => {
    entry.dragging = false;
    const { lat, lng } = marker.getLngLat();
    updateDroneTask(droneId, index, { lat, lng });
  });
  return entry;
}

/** Keeps one marker per task of every selected drone; markers of other drones are removed. */
export function syncTaskMarkers(map: MapLibreMap, drones: Record<string, DroneView>, selectedIds: string[]): void {
  const seen = new Set<string>();
  for (const droneId of selectedIds) {
    const drone = drones[droneId];
    if (!drone) continue;
    const locked = drone.status === 'lost_link';
    drone.tasks.forEach((point, index) => {
      const key = `${droneId}:${index}`;
      seen.add(key);
      let entry = entries.get(key);
      if (!entry || entry.map !== map || entry.locked !== locked) {
        entry?.marker.remove();
        entry = createEntry(map, droneId, drone.callsign, index, locked);
        entry.marker.setLngLat([point.lng, point.lat]).addTo(map);
        entries.set(key, entry);
      } else if (!entry.dragging) {
        entry.marker.setLngLat([point.lng, point.lat]);
      }
    });
  }
  for (const [key, entry] of entries) {
    if (!seen.has(key)) {
      entry.marker.remove();
      entries.delete(key);
    }
  }
}
