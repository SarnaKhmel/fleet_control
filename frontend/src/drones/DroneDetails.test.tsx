import { fireEvent, render, screen } from '@testing-library/react';
import { DroneDetails } from './DroneDetails';
import type { DroneView } from '../mission/missionStore';

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
});
