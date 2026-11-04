import { fireEvent, render, screen } from '@testing-library/react';
import { DroneDetails } from './DroneDetails';
import type { DroneView } from '../mission/missionStore';
import { clearDroneTasks, removeDroneTask } from '../mission/missionSocket';

vi.mock('../mission/missionSocket', () => ({ removeDroneTask: vi.fn(), clearDroneTasks: vi.fn() }));

const drone: DroneView = {
  callsign: 'BA-01',
  status: 'idle',
  progress: 100,
  position: { lat: 50.1, lng: 30.2 },
  heading: 92,
  altitudeM: 210,
  speedMs: 10,
  batteryPct: 88,
  crabDeg: -4,
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
});
