import type { LatLng } from '../protocol.js';
import { offsetLatLng, toMetersFrom } from './area.js';

// Reconnaissance: the ground the drones' cameras have seen, as a grid of square cells counted in meters
// from an origin (the mission area center). Shared by the simulator, which marks the cells, and the map,
// which draws them.

/** Horizontal field of view of a drone camera, degrees. */
export const CAMERA_FOV_DEG = 60;
/** How far a drone camera can make out the ground, meters. */
export const CAMERA_RANGE_M = 600;
/** Side of a reconnaissance cell, meters. */
export const RECON_CELL_M = 100;

/** A cell: [column east, row north] of the origin, whole numbers (negative west and south). */
export type ReconCell = [number, number];

/** The grid every reconnaissance message and snapshot is counted in. */
export interface ReconGrid {
  origin: LatLng;
  cellM: number;
}

/**
 * Cells whose centers a camera at `position` sees: within `rangeM` and within half the field of view
 * of `directionDeg` (the way the drone flies).
 */
export function coneCells(grid: ReconGrid, position: LatLng, directionDeg: number, fovDeg = CAMERA_FOV_DEG, rangeM = CAMERA_RANGE_M): ReconCell[] {
  const at = toMetersFrom(grid.origin, position);
  const cells: ReconCell[] = [];
  const [minX, maxX] = [Math.floor((at.east - rangeM) / grid.cellM), Math.floor((at.east + rangeM) / grid.cellM)];
  const [minY, maxY] = [Math.floor((at.north - rangeM) / grid.cellM), Math.floor((at.north + rangeM) / grid.cellM)];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const east = (x + 0.5) * grid.cellM - at.east;
      const north = (y + 0.5) * grid.cellM - at.north;
      if (Math.hypot(east, north) > rangeM) continue;
      const bearing = (Math.atan2(east, north) * 180) / Math.PI;
      const off = ((bearing - directionDeg + 540) % 360) - 180;
      if (Math.abs(off) <= fovDeg / 2) cells.push([x, y]);
    }
  }
  return cells;
}

/** Corners of a run of cells in one row, from column `fromX` to `toX` inclusive, as a closed ring. */
export function runRing(grid: ReconGrid, row: number, fromX: number, toX: number): LatLng[] {
  const corner = (x: number, y: number) => offsetLatLng(grid.origin, x * grid.cellM, y * grid.cellM);
  return [corner(fromX, row), corner(toX + 1, row), corner(toX + 1, row + 1), corner(fromX, row + 1), corner(fromX, row)];
}

/** The cells merged into runs along each row: [row, fromX, toX] (fewer shapes to draw than cells). */
export function rowRuns(cells: Iterable<ReconCell>): [number, number, number][] {
  const rows = new Map<number, number[]>();
  for (const [x, y] of cells) {
    const row = rows.get(y);
    if (row) row.push(x);
    else rows.set(y, [x]);
  }
  const runs: [number, number, number][] = [];
  for (const [y, xs] of [...rows].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let start = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] <= xs[i - 1] + 1) continue;
      runs.push([y, start, xs[i - 1]]);
      start = xs[i];
    }
  }
  return runs;
}

/** The cell a point lies in. */
export function cellOf(grid: ReconGrid, point: LatLng): ReconCell {
  const { east, north } = toMetersFrom(grid.origin, point);
  return [Math.floor(east / grid.cellM), Math.floor(north / grid.cellM)];
}

/** Cells whose centers lie within `radiusM` of `center` (what an observer there sees all around). */
export function circleCells(grid: ReconGrid, center: LatLng, radiusM: number): ReconCell[] {
  return coneCells(grid, center, 0, 360, radiusM);
}
