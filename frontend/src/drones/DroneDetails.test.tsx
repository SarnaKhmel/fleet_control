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
  origin: null,
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
});
