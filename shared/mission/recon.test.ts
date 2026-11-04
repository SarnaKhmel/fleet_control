import { describe, expect, it } from 'vitest';
import { offsetLatLng, toMetersFrom } from './area.js';
import { coneCells, rowRuns, runRing, type ReconGrid } from './recon.js';

const grid: ReconGrid = { origin: { lat: 50, lng: 30 }, cellM: 100 };

describe('coneCells', () => {
  it('sees the cells ahead within the field of view and range, and none behind', () => {
    const cells = coneCells(grid, grid.origin, 0, 60, 1000);
    const key = (x: number, y: number) => cells.some(([cx, cy]) => cx === x && cy === y);
    expect(key(0, 5)).toBe(true); // straight ahead (north), 550 m
    expect(key(0, 9)).toBe(true); // 950 m
    expect(key(0, 10)).toBe(false); // 1050 m: out of range
    expect(key(4, 5)).toBe(false); // 450 m east of the axis at 550 m north: about 39 degrees off, outside 30
    expect(key(2, 5)).toBe(true); // about 24 degrees off
    expect(key(0, -3)).toBe(false); // behind
  });

  it('covers about the area of the cone', () => {
    // A 60 degree sector of 1500 m covers 1.18 square km: about 118 cells of 100 m.
    const cells = coneCells(grid, offsetLatLng(grid.origin, 3000, -2000), 135);
    expect(cells.length).toBeGreaterThan(105);
    expect(cells.length).toBeLessThan(130);
  });

  it('counts cells from the origin wherever the drone is', () => {
    const drone = offsetLatLng(grid.origin, 5000, 5000);
    const cells = coneCells(grid, drone, 90, 60, 300);
    expect(cells.every(([x, y]) => x >= 50 && x <= 53 && y >= 48 && y <= 51)).toBe(true);
  });
});

describe('rowRuns', () => {
  it('merges neighbours in a row and keeps gaps and rows apart', () => {
    const cells: [number, number][] = [[3, 1], [1, 1], [2, 1], [5, 1], [0, -2], [0, -2]];
    expect(rowRuns(cells)).toEqual([[-2, 0, 0], [1, 1, 3], [1, 5, 5]]);
  });
});

describe('runRing', () => {
  it('outlines the run in meters from the origin', () => {
    const ring = runRing(grid, 2, -1, 1).map((p) => toMetersFrom(grid.origin, p));
    expect(ring.map(({ east, north }) => [Math.round(east), Math.round(north)])).toEqual([[-100, 200], [200, 200], [200, 300], [-100, 300], [-100, 200]]);
  });
});
