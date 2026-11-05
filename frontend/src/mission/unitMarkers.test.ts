import { describe, expect, it, vi } from 'vitest';
import { FakeMap } from '../test/maplibreMock';
import type { MissionUnit } from '../../../shared/mission/units';
import { syncUnitMarkers, unitElement, unitLabel } from './unitMarkers';

vi.mock('maplibre-gl', () => import('../test/maplibreMock'));

const vehicle: MissionUnit = { id: 'enemy-1', side: 'enemy', kind: 'vehicle', position: { lat: 50.1, lng: 30 }, headingDeg: 92, speedMs: 6, source: 'drone', detectedByDroneId: 'drone-2', inSight: true };
const ally: MissionUnit = { id: 'ally-1', side: 'ally', kind: 'infantry', position: { lat: 49.9, lng: 30 }, headingDeg: null, speedMs: 0, source: 'intel', detectedByDroneId: null, inSight: true };
const callsign = (id: string) => (id === 'drone-2' ? 'BA-02' : id);
type FakeMarker = { element: HTMLElement; lngLat: number[]; added: boolean };

describe('unit markers', () => {
  it('names the unit, how it was found and where it is heading', () => {
    expect(unitLabel(vehicle, callsign)).toBe('Enemy: armoured vehicles · found by BA-02 · moving 22 km/h, course 90°');
    expect(unitLabel(ally, callsign)).toBe('Ally: infantry · known from intelligence');
  });

  it('marks a unit a strike damaged: in its label, and with a ring on the marker', () => {
    const hurt = { ...vehicle, damaged: true };
    expect(unitLabel(hurt, callsign)).toBe('Enemy: armoured vehicles · found by BA-02 · moving 22 km/h, course 90° · damaged');
    expect(unitElement(hurt, 'x').classList.contains('is-damaged')).toBe(true);
    expect(unitElement(vehicle, 'x').classList.contains('is-damaged')).toBe(false);
  });

  it('shows a unit out of sight as last seen, faded, and keeps its course on the marker', () => {
    const lost = { ...vehicle, inSight: false };
    expect(unitLabel(lost, callsign)).toMatch(/last seen here/);
    const el = unitElement(lost, 'x');
    expect(el.classList.contains('is-last-seen')).toBe(true);
    expect(el.innerHTML).toBe(unitElement({ ...vehicle, inSight: false }, 'x').innerHTML);
    expect(el.innerHTML).not.toBe(unitElement({ ...lost, headingDeg: null, speedMs: 0 }, 'x').innerHTML);
    expect(unitElement(vehicle, 'x').classList.contains('is-last-seen')).toBe(false);
  });

  it('draws the enemy hostile and allies friendly, as NATO symbols', () => {
    const enemyEl = unitElement(vehicle, 'x');
    expect(enemyEl.querySelector('svg')).toBeTruthy();
    expect(enemyEl.classList.contains('is-enemy')).toBe(true);
    expect(unitElement(ally, 'x').classList.contains('is-ally')).toBe(true);
    // A unit on the move carries the direction arrow: its symbol differs from the same unit standing.
    expect(enemyEl.innerHTML).not.toBe(unitElement({ ...vehicle, speedMs: 0 }, 'x').innerHTML);
  });

  it('moves a marker on a new position, rebuilds it only when the course turns, and drops units no longer known', () => {
    const map = new FakeMap({ style: 'x' });
    const [first] = syncUnitMarkers(map as never, { 'enemy-1': vehicle, 'ally-1': ally }, callsign);
    const [moved] = syncUnitMarkers(map as never, { 'enemy-1': { ...vehicle, position: { lat: 50.2, lng: 30 }, headingDeg: 91 }, 'ally-1': ally }, callsign);
    expect(moved).toBe(first);
    expect((moved as unknown as FakeMarker).lngLat).toEqual([30, 50.2]);
    const [turned] = syncUnitMarkers(map as never, { 'enemy-1': { ...vehicle, headingDeg: 180 } }, callsign);
    expect(turned).not.toBe(first);
    const markers = syncUnitMarkers(map as never, {}, callsign);
    expect(markers).toEqual([]);
    expect((turned as unknown as FakeMarker).added).toBe(false);
  });
});
