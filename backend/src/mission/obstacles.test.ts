import { describe, expect, it } from 'vitest';
import { offsetLatLng, toMetersFrom } from '../../../shared/mission/area.js';
import type { Building, Buildings } from '../buildings/buildings.js';
import { buildingAhead, hitOnStep, samplePath } from './obstacles.js';

const origin = { lat: 50, lng: 30 };
const at = (eastM: number, northM: number) => offsetLatLng(origin, eastM, northM);

/** Buildings as boxes in meters east/north of the origin. */
function boxes(...list: { west: number; east: number; south: number; north: number; heightM: number }[]): Buildings {
  const made = list.map((b) => ({ ...b, building: { rings: [], heightM: b.heightM, south: 0, north: 0, west: 0, east: 0 } as Building }));
  return {
    at(point) {
      const { east, north } = toMetersFrom(origin, point);
      return made.find((b) => east >= b.west && east <= b.east && north >= b.south && north <= b.north)?.building ?? null;
    },
  };
}

describe('samplePath', () => {
  it('walks the path every step, across corners, up to the limit', () => {
    const samples = samplePath([at(0, 0), at(0, 25), at(20, 25)], 10, 1000);
    expect(samples.map((s) => Math.round(s.distanceM))).toEqual([0, 10, 20, 30, 40, 45]);
    expect(toMetersFrom(origin, samples[3].point).east).toBeCloseTo(5, 3);
    expect(samplePath([at(0, 0), at(0, 100)], 10, 35).map((s) => Math.round(s.distanceM))).toEqual([0, 10, 20, 30]);
  });
});

describe('buildingAhead', () => {
  const tower = { west: -20, east: 20, south: 300, north: 340, heightM: 80 };
  const shed = { west: -20, east: 20, south: 150, north: 170, heightM: 8 };

  it('finds the first building at or near the drone height, with the distance to it', () => {
    const found = buildingAhead(boxes(shed, tower), [at(0, 0), at(0, 1000)], 2000, 60);
    expect(found?.building.heightM).toBe(80);
    expect(found?.distanceM).toBeCloseTo(300, 0);
  });

  it('counts a building just below the drone, within the clearance, and passes lower ones', () => {
    expect(buildingAhead(boxes({ ...tower, heightM: 55 }), [at(0, 0), at(0, 1000)], 2000, 60)).not.toBeNull();
    expect(buildingAhead(boxes({ ...tower, heightM: 45 }), [at(0, 0), at(0, 1000)], 2000, 60)).toBeNull();
  });

  it('looks only as far as asked and follows the route around corners', () => {
    expect(buildingAhead(boxes(tower), [at(0, 0), at(0, 1000)], 250, 60)).toBeNull();
    const side = { west: 300, east: 340, south: 480, north: 520, heightM: 80 };
    expect(buildingAhead(boxes(side), [at(0, 0), at(0, 500), at(1000, 500)], 2000, 60)?.distanceM).toBeCloseTo(800, 0);
  });

  it('does not count the building the drone starts in', () => {
    const roof = { west: -50, east: 50, south: -50, north: 50, heightM: 100 };
    expect(buildingAhead(boxes(roof), [at(0, 0), at(0, 1000)], 2000, 60)).toBeNull();
  });
});

describe('hitOnStep', () => {
  it('returns where a step enters a building taller than the drone, even a thin one between samples', () => {
    const wall = { west: -20, east: 20, south: 52, north: 58, heightM: 70 };
    const hit = hitOnStep(boxes(wall), at(0, 0), at(0, 100), 60);
    expect(toMetersFrom(origin, hit!).north).toBeCloseTo(55, 0);
    expect(hitOnStep(boxes(wall), at(0, 0), at(0, 100), 75)).toBeNull();
  });
});
