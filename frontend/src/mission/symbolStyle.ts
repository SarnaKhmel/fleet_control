import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// How drones are drawn on the map: standard NATO symbols, or our own simple style.
export type SymbolStyle = 'nato' | 'custom';

interface SymbolStyleState {
  style: SymbolStyle;
  setStyle: (style: SymbolStyle) => void;
}

export const useSymbolStyleStore = create<SymbolStyleState>()(
  persist(
    (set) => ({
      style: 'nato',
      setStyle: (style) => set({ style }),
    }),
    { name: 'fleet.symbolStyle' },
  ),
);
