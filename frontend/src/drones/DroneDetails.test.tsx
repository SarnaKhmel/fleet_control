import { act, fireEvent, render, screen } from '@testing-library/react';
import { useWindStore } from '../wind/windStore';
import { DroneDetails } from './DroneDetails';
import type { DroneView } from '../mission/missionStore';
import { clearDroneTasks, removeDroneTask } from '../mission/missionSocket';

vi.mock('../mission/missionSocket', () => ({ removeDroneTask: vi.fn(), clearDroneTasks: vi.fn() }));

const drone: DroneView = {
  callsign: 'BA-01',
  status: 'idle',
  cause: null,
  warning: null,
  progress: 100,
  position: { lat: 50.1, lng: 30.2 },
  heading: 92,
  altitudeM: 210, groundM: 150,
  speedMs: 10,
  batteryPct: 88,
  crabDeg: -4,
  altitudeAglM: 60,
  cruiseSpeedMs: 10,
  trail: [],
  tasks: [],
};

describe('DroneDetails', () => {
  it('shows the summary in the header and the telemetry when opened', () => {
    render(<DroneDetails droneId="drone-1" drone={drone} defaultOpen={false} />);
    expect(screen.getByText('60 m · 88%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /BA-01/ }));
    expect(screen.getByText('92°')).toBeTruthy();
    expect(screen.getByText('10.0 m/s')).toBeTruthy();
    expect(screen.getByText('-4°')).toBeTruthy();
  });

  it('lists the tasks and removes one or all of them', () => {
    const tasks = [{ lat: 50.2, lng: 30.3 }, { lat: 50.4, lng: 30.5 }];
    render(<DroneDetails droneId="drone-1" drone={{ ...drone, tasks }} defaultOpen />);
    expect(screen.getByText('50.20000, 30.30000')).toBeTruthy();
    expect(screen.getByText('50.40000, 30.50000')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove task 2' }));
    expect(removeDroneTask).toHaveBeenCalledWith('drone-1', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(clearDroneTasks).toHaveBeenCalledWith('drone-1');
  });

  it('says so when the drone has no tasks', () => {
    render(<DroneDetails droneId="drone-1" drone={drone} defaultOpen />);
    expect(screen.getByText(/No tasks/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
  });

  it('highlights a low and a critical battery', () => {
    const { rerender } = render(<DroneDetails droneId="drone-1" drone={{ ...drone, batteryPct: 31 }} defaultOpen />);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<DroneDetails droneId="drone-1" drone={{ ...drone, batteryPct: 30 }} defaultOpen />);
    expect(screen.getByRole('alert').textContent).toBe('Low battery: 30%. Bring the drone back or finish the task.');
    expect(screen.getByRole('alert').className).toContain('is-low');
    rerender(<DroneDetails droneId="drone-1" drone={{ ...drone, batteryPct: 9.6 }} defaultOpen />);
    expect(screen.getByRole('alert').textContent).toContain('Critical battery: 10%');
    expect(screen.getByRole('alert').className).toContain('is-critical');
  });

  it('shows a lost drone with where it fell and its unfinished route, without commands', () => {
    const lost: DroneView = { ...drone, status: 'lost_link', batteryPct: 0, speedMs: 0, tasks: [{ lat: 50.2, lng: 30.3 }] };
    render(<DroneDetails droneId="drone-1" drone={lost} defaultOpen />);
    expect(screen.getByRole('alert').textContent).toContain('Link lost');
    expect(screen.getByText('link lost')).toBeTruthy();
    expect(screen.getByText('50.10000, 30.20000')).toBeTruthy();
    expect(screen.getByText('50.20000, 30.30000')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove task 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
  });

  it('shows a destroyed drone with where it fell', () => {
    render(<DroneDetails droneId="drone-1" drone={{ ...drone, status: 'destroyed', batteryPct: 0, speedMs: 0 }} defaultOpen />);
    expect(screen.getByRole('alert').textContent).toContain('Destroyed');
    expect(screen.getByRole('alert').className).toContain('is-destroyed');
    expect(screen.getByText('destroyed')).toBeTruthy();
    expect(screen.getByText('50.10000, 30.20000')).toBeTruthy();
  });

  it('keeps warning about the battery of a landed drone, which still takes commands', () => {
    render(<DroneDetails droneId="drone-1" drone={{ ...drone, status: 'landed', altitudeM: 150, groundM: 150, batteryPct: 20 }} defaultOpen />);
    expect(screen.getByText('landed')).toBeTruthy();
    expect(screen.getByRole('alert').className).toContain('is-low');
    expect(screen.getByText('0 m · 20%')).toBeTruthy();
  });

  it('warns of a building ahead with the time and distance to impact', () => {
    render(<DroneDetails droneId="drone-1" drone={{ ...drone, status: 'moving', warning: { kind: 'building' as const, point: { lat: 50.02, lng: 30 }, distanceM: 1200, etaS: 12, heightM: 70 } }} defaultOpen />);
    const alert = screen.getAllByRole('alert')[0];
    expect(alert.className).toContain('is-collision');
    expect(alert.textContent).toBe('Building ahead, 70 m tall, at the flight height: impact in about 12 s (1200 m). Raise the drone or change its route.');
  });

  it('says a drone destroyed in a collision flew into a building', () => {
    render(<DroneDetails droneId="drone-1" drone={{ ...drone, status: 'destroyed', cause: 'collision', batteryPct: 40 }} defaultOpen />);
    expect(screen.getByRole('alert').textContent).toBe('Destroyed: the drone flew into a building at the position shown.');
  });

  it('says a drone shot down by infantry was destroyed where it was hit', () => {
    render(<DroneDetails droneId="drone-1" drone={{ ...drone, status: 'destroyed', cause: 'shot_down', batteryPct: 40 }} defaultOpen />);
    expect(screen.getByRole('alert').textContent).toBe('Shot down by infantry: the drone was destroyed at the position shown.');
  });

  it('shows how far the drone can still fly, against the wind and with it', () => {
    useWindStore.setState({ wind: { speedMs: 0, fromDeg: 0 } });
    const { rerender } = render(<DroneDetails droneId="drone-1" drone={{ ...drone, batteryPct: 50 }} defaultOpen />);
    expect(screen.getByText('12.0 km')).toBeTruthy(); // 1200 s at 10 m/s
    act(() => useWindStore.setState({ wind: { speedMs: 4, fromDeg: 0 } }));
    rerender(<DroneDetails droneId="drone-1" drone={{ ...drone, batteryPct: 50 }} defaultOpen />);
    expect(screen.getByText('7.2–16.8 km')).toBeTruthy(); // 6 and 14 m/s over the ground
    useWindStore.setState({ wind: { speedMs: 0, fromDeg: 0 } });
  });
});
