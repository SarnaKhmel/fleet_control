import { Profiler } from 'react';
import { act, render, screen } from '@testing-library/react';
import { RightPanel } from './RightPanel';
import { useMissionStore, type DroneView } from '../mission/missionStore';
import { useSelectionStore } from '../mission/selection';

const drone = (callsign: string): DroneView => ({ callsign, status: 'idle', progress: 100, position: { lat: 50, lng: 30 }, heading: 0, altitudeM: 210, groundM: 150, speedMs: 0, batteryPct: 100, crabDeg: 0, altitudeAglM: 60, cruiseSpeedMs: 10, trail: [], tasks: [] });
const position = (droneId: string, heading: number) => ({ type: 'position' as const, droneId, position: { lat: 50.1, lng: 30 }, heading, speedMs: 10, altitudeM: 210, groundM: 150, batteryPct: 99, crabDeg: 0 });

describe('RightPanel', () => {
  beforeEach(() => {
    useMissionStore.setState({ phase: 'running', drones: { 'drone-1': drone('BA-01'), 'drone-2': drone('BA-02') } });
    useSelectionStore.setState({ selectedIds: ['drone-1'] });
  });
  afterEach(() => {
    useMissionStore.setState({ phase: 'idle', drones: {} });
    useSelectionStore.setState({ selectedIds: [] });
  });

  it('shows live telemetry of the selected drone', () => {
    render(<RightPanel />);
    act(() => useMissionStore.getState().apply(position('drone-1', 45)));
    expect(screen.getByText('45°')).toBeTruthy();
  });

  it('does not re-render when a drone that is not selected moves', () => {
    let renders = 0;
    render(
      <Profiler id="right" onRender={() => renders++}>
        <RightPanel />
      </Profiler>,
    );
    const before = renders;
    act(() => useMissionStore.getState().apply(position('drone-2', 90)));
    expect(renders).toBe(before);
  });
});
