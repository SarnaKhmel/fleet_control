import { Profiler } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DroneControls } from './DroneControls';
import { useMissionStore, type DroneView } from './missionStore';
import { useSelectionStore } from './selection';

const online: DroneView = { callsign: 'BA-01', status: 'idle', progress: 100, position: { lat: 50, lng: 30 }, heading: 0, altitudeM: 210, speedMs: 0, batteryPct: 100, crabDeg: 0, trail: [], tasks: [] };
const position = (lat: number, altitudeM: number) => ({ type: 'position' as const, droneId: 'drone-1', position: { lat, lng: 30 }, heading: 0, speedMs: 10, altitudeM, batteryPct: 99, crabDeg: 0 });

describe('DroneControls', () => {
  beforeEach(() => {
    useSelectionStore.setState({ selectedIds: [] });
    useMissionStore.setState({ phase: 'running', drones: { 'drone-1': online }, droneCount: 3 });
  });
  afterEach(() => useMissionStore.setState({ phase: 'idle', drones: {} }));

  it('shows each online drone with its status and, in the air, its height above the ground', () => {
    render(<DroneControls />);
    expect(screen.getByText('hovering · 60 m')).toBeTruthy();
    expect(screen.getByText('Online 1/3')).toBeTruthy();
  });

  it('lists every drone of the mission, with two-digit callsigns', () => {
    useMissionStore.setState({ droneCount: 12 });
    render(<DroneControls />);
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByText('BA-12')).toBeTruthy();
    expect(screen.getByText('Online 1/12')).toBeTruthy();
  });

  it('selects a drone from its row, and Shift+click adds or removes one', () => {
    render(<DroneControls />);
    fireEvent.click(screen.getByRole('button', { name: /BA-01/ }));
    expect(useSelectionStore.getState().selectedIds).toEqual(['drone-1']);
    expect(screen.getByRole('button', { name: /BA-01/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /BA-02/ }), { shiftKey: true });
    expect(useSelectionStore.getState().selectedIds).toEqual(['drone-1', 'drone-2']);
    fireEvent.click(screen.getByRole('button', { name: /BA-01/ }), { shiftKey: true });
    expect(useSelectionStore.getState().selectedIds).toEqual(['drone-2']);
    expect(screen.getByText(/Click a drone here or on the map/)).toBeTruthy();
  });

  it('re-renders only when what it shows changes, not on every position update', () => {
    let renders = 0;
    render(
      <Profiler id="controls" onRender={() => renders++}>
        <DroneControls />
      </Profiler>,
    );
    const before = renders;
    act(() => useMissionStore.getState().apply(position(50.1, 210)));
    expect(renders).toBe(before);
    act(() => useMissionStore.getState().apply(position(50.2, 215)));
    expect(screen.getByText('hovering · 65 m')).toBeTruthy();
  });

  it('names the state of drones on the ground or out, and counts only those that take commands as online', () => {
    useMissionStore.setState({
      drones: {
        'drone-1': { ...online, status: 'landed', altitudeM: 150 },
        'drone-2': { ...online, status: 'destroyed', altitudeM: 150 },
        'drone-3': { ...online, status: 'moving' },
      },
    });
    render(<DroneControls />);
    expect(screen.getByText('landed')).toBeTruthy();
    expect(screen.getByText('destroyed')).toBeTruthy();
    expect(screen.getByText('moving · 60 m')).toBeTruthy();
    expect(screen.getByText('Online 2/3')).toBeTruthy();
  });
});
