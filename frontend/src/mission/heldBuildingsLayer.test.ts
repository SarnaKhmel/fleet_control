import { describe, expect, it } from 'vitest';
import type { MissionUnit } from '../../../shared/mission/units';
import { FakeMap } from '../test/maplibreMock';
import { addHeldBuildingsLayer, HELD_SOURCE_ID, heldBuildingFeatures, syncHeldBuildings } from './heldBuildingsLayer';
import { ENGAGE_COLORS } from './engageLayer';
import { WAYPOINT_COLORS } from './waypointLayer';

const rings = [[{ lat: 50, lng: 30 }, { lat: 50, lng: 30.001 }, { lat: 50.001, lng: 30 }]];
const held: MissionUnit = { id: 'enemy-2', side: 'enemy', kind: 'position', position: { lat: 50, lng: 30 }, headingDeg: null, speedMs: 0, source: 'ally', detectedByDroneId: null, inSight: true, building: { rings, heightM: 12 } };

describe('held buildings layer', () => {
  it('colors an enemy-held building red and an allied one blue, lifted a little over the map building', () => {
    const { features } = heldBuildingFeatures({ 'enemy-2': held, 'ally-2': { ...held, id: 'ally-2', side: 'ally' } }, 'dark');
    expect(features.map((f) => [f.properties.unitId, f.properties.color, f.properties.heightM])).toEqual([
      ['enemy-2', ENGAGE_COLORS.dark, 13],
      ['ally-2', WAYPOINT_COLORS.dark, 13],
    ]);
  });

  it('closes the ring of the polygon', () => {
    const [feature] = heldBuildingFeatures({ 'enemy-2': held }, 'dark').features;
    const ring = feature.geometry.coordinates[0];
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual(ring[3]);
  });

  it('skips units that hold no building, and positions that were destroyed', () => {
    const plain = { ...held, id: 'enemy-3', building: undefined };
    expect(heldBuildingFeatures({ 'enemy-3': plain, 'enemy-2': { ...held, destroyed: true } }, 'dark').features).toEqual([]);
  });

  it('adds its source and layer once and fills them with the held buildings', () => {
    const map = new FakeMap({ style: 'x' });
    syncHeldBuildings(map as never, { 'enemy-2': held }, 'dark');
    expect(map.getSource(HELD_SOURCE_ID)).toBeUndefined();
    addHeldBuildingsLayer(map as never);
    addHeldBuildingsLayer(map as never);
    syncHeldBuildings(map as never, { 'enemy-2': held }, 'dark');
    expect((map.getSource(HELD_SOURCE_ID) as unknown as { data: { features: unknown[] } }).data.features).toHaveLength(1);
    syncHeldBuildings(map as never, {}, 'dark');
    expect((map.getSource(HELD_SOURCE_ID) as unknown as { data: { features: unknown[] } }).data.features).toHaveLength(0);
  });
});
