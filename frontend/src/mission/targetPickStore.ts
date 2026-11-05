import { create } from 'zustand';

// The enemy unit the operator clicked on the map, and where the click was on screen: the target pop-up
// opens there. Null when no pop-up is open.
export interface TargetPick {
  unitId: string;
  x: number;
  y: number;
}

interface TargetPickState {
  pick: TargetPick | null;
  open: (unitId: string, x: number, y: number) => void;
  close: () => void;
}

export const useTargetPickStore = create<TargetPickState>()((set) => ({
  pick: null,
  open: (unitId, x, y) => set({ pick: { unitId, x, y } }),
  close: () => set({ pick: null }),
}));
