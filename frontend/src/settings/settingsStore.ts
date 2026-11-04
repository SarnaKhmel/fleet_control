import { create } from 'zustand';

interface SettingsPanelState {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

// Open/closed state of the right-side settings panel, shared by the header gear and the panel.
export const useSettingsPanelStore = create<SettingsPanelState>()((set, get) => ({
  open: false,
  toggle: () => set({ open: !get().open }),
  setOpen: (open) => set({ open }),
}));
