import { create } from 'zustand';

export type MapIssue = 'style' | 'terrain' | null;

interface MapIssueState {
  issue: MapIssue;
  setIssue: (issue: MapIssue) => void;
}

// A failed basemap blocks the map; failed terrain only removes relief and elevation.
export const useMapIssueStore = create<MapIssueState>()((set) => ({
  issue: null,
  setIssue: (issue) => set({ issue }),
}));
