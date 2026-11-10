import { describe, expect, it, vi } from 'vitest';
import type { MissionUnit } from '../../../shared/mission/units';
import { FakeMap } from '../test/maplibreMock';
import { addEngageLayer, ENGAGE_COLORS, ENGAGE_LINE_ID, ENGAGE_SOURCE_ID, engageFeatures, syncEngage } from './engageLayer';
import type { DroneView } from './missionStore';

const drone: DroneView = { callsign: 'BA-01', status: 'engaging', cause: null, warning: null, targetId: 'enemy-1', progress: 100, position: { lat: 50, lng: 30 }, heading: 0, altitudeM: 210, groundM: 150, speedMs: 10, batteryPct: 50, crabDeg: 0, altitudeAglM: 60, cruiseSpeedMs: 10, trail: [], tasks: [] };
const enemy: MissionUnit = { id: 'enemy-1', side: 'enemy', kind: 'vehicle', position: { lat: 50.1, lng: 30.2 }, headingDeg: null, speedMs: 0, source: 'drone', detectedByDroneId: 'drone-1', inSight: true };

describe('engage layer', () => {
  it('draws a line from each selected engaging drone to its target', () => {
    const drones = { 'drone-1': drone, 'drone-2': drone };
    const { features } = engageFeatures(drones, { 'enemy-1': enemy }, ['drone-1']);
    expect(features).toHaveLength(1);
    expect(features[0].properties).toEqual({ droneId: 'drone-1', targetId: 'enemy-1' });
    expect(features[0].geometry.coordinates).toEqual([[30, 50], [30.2, 50.1]]);
  });

  it('draws nothing for a drone that is not selected, not engaging, without a position, or without a live target', () => {
    const units = { 'enemy-1': enemy };
    expect(engageFeatures({ 'drone-1': drone }, units, []).features).toEqual([]);
    expect(engageFeatures({ 'drone-1': { ...drone, status: 'moving' } }, units, ['drone-1']).features).toEqual([]);
    expect(engageFeatures({ 'drone-1': { ...drone, position: null } }, units, ['drone-1']).features).toEqual([]);
    expect(engageFeatures({ 'drone-1': { ...drone, targetId: null } }, units, ['drone-1']).features).toEqual([]);
    expect(engageFeatures({ 'drone-1': drone }, {}, ['drone-1']).features).toEqual([]);
    expect(engageFeatures({ 'drone-1': drone }, { 'enemy-1': { ...enemy, destroyed: true } }, ['drone-1']).features).toEqual([]);
  });

  it('follows the target as it moves', () => {
    const at = (lat: number) => engageFeatures({ 'drone-1': drone }, { 'enemy-1': { ...enemy, position: { lat, lng: 30.2 } } }, ['drone-1']).features[0].geometry.coordinates[1];
    expect(at(50.3)).toEqual([30.2, 50.3]);
  });

  it('adds its source and layer once, fills them and follows the theme', () => {
    const map = new FakeMap({ style: 'x' });
    syncEngage(map as never, { 'drone-1': drone }, { 'enemy-1': enemy }, ['drone-1'], 'dark');
    expect(map.getSource(ENGAGE_SOURCE_ID)).toBeUndefined();
    addEngageLayer(map as never, 'dark');
    addEngageLayer(map as never, 'dark');
    const paint = vi.spyOn(map, 'setPaintProperty');
    syncEngage(map as never, { 'drone-1': drone }, { 'enemy-1': enemy }, ['drone-1'], 'light');
    expect((map.getSource(ENGAGE_SOURCE_ID) as unknown as { data: { features: unknown[] } }).data.features).toHaveLength(1);
    expect(paint).toHaveBeenCalledWith(ENGAGE_LINE_ID, 'line-color', ENGAGE_COLORS.light);
  });
});
