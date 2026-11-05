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

/**
 * The issue a source event leaves on the map. A failed terrain tile raises the terrain issue, unless the request
 * was only aborted (the map moved on: not a failure). Terrain that loads again clears it.
 */
export function terrainIssue(current: MapIssue, event: { sourceId?: string; isSourceLoaded?: boolean; error?: unknown }, terrainId: string): MapIssue {
  if (event.sourceId !== terrainId) return current;
  if (event.error !== undefined) {
    const aborted = (event.error as { name?: string } | null)?.name === 'AbortError';
    return aborted ? current : 'terrain';
  }
  return event.isSourceLoaded && current === 'terrain' ? null : current;
}
