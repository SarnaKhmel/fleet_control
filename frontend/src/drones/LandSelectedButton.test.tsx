import { fireEvent, render, screen } from '@testing-library/react';
import { LandSelectedButton } from './LandSelectedButton';
import { useMissionStore, type DroneView } from '../mission/missionStore';
import { useSelectionStore } from '../mission/selection';
import { landSelectedDrones } from '../mission/missionSocket';

vi.mock('../mission/missionSocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mission/missionSocket')>()),
  landSelectedDrones: vi.fn(),
}));

const drone = (status: DroneView['status']): DroneView => ({ callsign: 'BA-01', status, cause: null, warning: null, targetId: null, progress: 100, position: { lat: 50, lng: 30 }, heading: 0, altitudeM: 210, groundM: 150, speedMs: 0, batteryPct: 100, crabDeg: 0, altitudeAglM: 60, cruiseSpeedMs: 10, trail: [], tasks: [] });

describe('LandSelectedButton', () => {
  beforeEach(() => {
    useMissionStore.setState({ phase: 'running', drones: { 'drone-1': drone('idle'), 'drone-2': drone('moving'), 'drone-3': drone('landed') } });
  });
  afterEach(() => {
    useMissionStore.setState({ phase: 'idle', drones: {} });
    useSelectionStore.setState({ selectedIds: [] });
  });

  it('lands the selected drones that are in the air, one or a group', () => {
    useSelectionStore.setState({ selectedIds: ['drone-1', 'drone-2', 'drone-3'] });
    render(<LandSelectedButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Land (2)' }));
    expect(landSelectedDrones).toHaveBeenCalledOnce();
  });

  it('is hidden when none of the selected drones is in the air', () => {
    useSelectionStore.setState({ selectedIds: ['drone-3'] });
    render(<LandSelectedButton />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
