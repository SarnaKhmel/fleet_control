import { fireEvent, render, screen } from '@testing-library/react';
import { TargetPopup } from './TargetPopup';
import { useTargetPickStore } from './targetPickStore';
import { useMissionStore } from './missionStore';
import { useSelectionStore } from './selection';
import { engageEnemy } from './missionSocket';

vi.mock('./missionSocket', async (importOriginal) => ({ ...(await importOriginal<typeof import('./missionSocket')>()), engageEnemy: vi.fn() }));

const enemy = { id: 'enemy-1', side: 'enemy' as const, kind: 'vehicle' as const, position: { lat: 50.1, lng: 30 }, headingDeg: null, speedMs: 0, source: 'intel' as const, detectedByDroneId: null, inSight: true };
const drone = (status: string) => ({ callsign: 'BA-01', status, cause: null, warning: null, progress: 100, position: null, heading: null, altitudeM: null, groundM: null, speedMs: 0, batteryPct: 90, crabDeg: 0, altitudeAglM: 60, cruiseSpeedMs: 10, trail: [], tasks: [] });

describe('TargetPopup', () => {
  beforeEach(() => {
    vi.mocked(engageEnemy).mockClear();
    useMissionStore.setState({ units: { 'enemy-1': enemy }, drones: { 'drone-1': drone('idle') } as never });
    useSelectionStore.setState({ selectedIds: ['drone-1'] });
    useTargetPickStore.setState({ pick: { unitId: 'enemy-1', x: 100, y: 200 } });
  });

  it('shows nothing when no enemy unit is picked', () => {
    useTargetPickStore.setState({ pick: null });
    const { container } = render(<TargetPopup />);
    expect(container.innerHTML).toBe('');
  });

  it('strikes the picked unit with the selected drones and closes', () => {
    render(<TargetPopup />);
    expect(screen.getByText('enemy-1 · armoured vehicles')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Strike' }));
    expect(engageEnemy).toHaveBeenCalledWith('drone-1', 'enemy-1', 'strike');
    expect(useTargetPickStore.getState().pick).toBeNull();
  });

  it('pursues it with the selected drones that take commands only', () => {
    useMissionStore.setState({ drones: { 'drone-1': drone('idle'), 'drone-2': drone('destroyed') } as never });
    useSelectionStore.setState({ selectedIds: ['drone-1', 'drone-2'] });
    render(<TargetPopup />);
    fireEvent.click(screen.getByRole('button', { name: 'Pursuit' }));
    expect(engageEnemy).toHaveBeenCalledTimes(1);
    expect(engageEnemy).toHaveBeenCalledWith('drone-1', 'enemy-1', 'pursuit');
  });

  it('says to select a drone first when none is selected, and keeps the pop-up open', () => {
    useSelectionStore.setState({ selectedIds: [] });
    render(<TargetPopup />);
    fireEvent.click(screen.getByRole('button', { name: 'Strike' }));
    expect(engageEnemy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Select a drone first (Shift-click or box select).');
    expect(useTargetPickStore.getState().pick).not.toBeNull();
  });

  it('closes with Escape', () => {
    render(<TargetPopup />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useTargetPickStore.getState().pick).toBeNull();
  });
});
