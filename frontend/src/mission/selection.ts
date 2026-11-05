import { create } from 'zustand';

// Selected drones (RTS-style). Shift+click toggles one drone, Shift+drag selects all in a box.
interface SelectionState {
  selectedIds: string[];
  select: (ids: string[]) => void;
  toggle: (id: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  selectedIds: [],
  select: (ids) => set({ selectedIds: [...new Set(ids)] }),
  toggle: (id) => {
    const current = get().selectedIds;
    set({ selectedIds: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] });
  },
  clear: () => set({ selectedIds: [] }),
}));

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Ids of the drones whose screen position lies inside the box (corners in any order). */
export function dronesInScreenBox(
  positions: Record<string, ScreenPoint>,
  a: ScreenPoint,
  b: ScreenPoint,
): string[] {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return Object.entries(positions)
    .filter(([, p]) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom)
    .map(([id]) => id);
}
