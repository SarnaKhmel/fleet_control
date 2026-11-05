import { Profiler } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FlightSettings } from './FlightSettings';
import { useMissionStore, type DroneView } from '../mission/missionStore';
import { useSelectionStore } from '../mission/selection';
import { setSelectedFlight } from '../mission/missionSocket';

vi.mock('../mission/missionSocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mission/missionSocket')>()),
  setSelectedFlight: vi.fn(),
}));

const drone = (status: DroneView['status'], altitudeAglM = 60, cruiseSpeedMs = 10): DroneView => ({ callsign: 'BA-01', status, cause: null, warning: null, progress: 100, position: { lat: 50, lng: 30 }, heading: 0, altitudeM: 210, groundM: 150, speedMs: 0, batteryPct: 100, crabDeg: 0, altitudeAglM, cruiseSpeedMs, trail: [], tasks: [] });

describe('FlightSettings', () => {
  beforeEach(() => {
    vi.mocked(setSelectedFlight).mockClear();
    useMissionStore.setState({ phase: 'running', drones: { 'drone-1': drone('moving', 120, 15), 'drone-2': drone('landed'), 'drone-3': drone('destroyed') } });
    useSelectionStore.setState({ selectedIds: ['drone-1', 'drone-2', 'drone-3'] });
  });
  afterEach(() => {
    useMissionStore.setState({ phase: 'idle', drones: {} });
    useSelectionStore.setState({ selectedIds: [] });
  });

  it('starts from the first selected drone and sets height and speed for every selected drone that takes commands', () => {
    render(<FlightSettings />);
    const height = screen.getByLabelText('Height above ground, m') as HTMLInputElement;
    const speed = screen.getByLabelText('Speed, m/s') as HTMLInputElement;
    expect([height.value, speed.value]).toEqual(['120', '15']);
    fireEvent.change(height, { target: { value: '200' } });
    fireEvent.change(speed, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply (2)' }));
    expect(setSelectedFlight).toHaveBeenCalledWith({ altitudeAglM: 200, cruiseSpeedMs: 25 });
  });

  it('does not send values outside the allowed ranges', () => {
    render(<FlightSettings />);
    fireEvent.change(screen.getByLabelText('Height above ground, m'), { target: { value: '5' } });
    const apply = screen.getByRole('button', { name: 'Apply (2)' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(setSelectedFlight).not.toHaveBeenCalled();
  });

  it('is hidden when no selected drone takes commands', () => {
    useSelectionStore.setState({ selectedIds: ['drone-3'] });
    render(<FlightSettings />);
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not re-render on position updates', () => {
    let renders = 0;
    render(
      <Profiler id="flight" onRender={() => renders++}>
        <FlightSettings />
      </Profiler>,
    );
    const before = renders;
    act(() => useMissionStore.getState().apply({ type: 'position', droneId: 'drone-1', position: { lat: 50.1, lng: 30 }, heading: 10, speedMs: 15, altitudeM: 280, groundM: 160, batteryPct: 90, crabDeg: 0 }));
    expect(renders).toBe(before);
  });
});
