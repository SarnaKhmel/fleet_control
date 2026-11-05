import { fireEvent, render, screen } from '@testing-library/react';
import { MissionClock } from './MissionClock';
import { useMissionStore } from './missionStore';
import { setMissionClock } from './missionSocket';

vi.mock('./missionSocket', () => ({ setMissionClock: vi.fn() }));

const running = { startedAt: new Date(2026, 10, 5, 9, 5, 7).toISOString(), simulatedS: 3723, speed: 1, paused: false };

describe('MissionClock', () => {
  beforeEach(() => {
    vi.mocked(setMissionClock).mockClear();
    useMissionStore.setState({ clock: { startedAt: null, simulatedS: 0, speed: 1, paused: false } });
  });

  it('says the mission has not started, and the speed buttons are off', () => {
    render(<MissionClock />);
    expect(screen.getByText('The mission has not started.')).toBeTruthy();
    expect((screen.getByRole('button', { name: '×5' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the start time and the simulated time, and sends a speed or a pause', () => {
    useMissionStore.setState({ clock: running });
    render(<MissionClock />);
    expect(screen.getByText('Started at 09:05:07')).toBeTruthy();
    expect(screen.getByText('Simulated time: 1:02:03')).toBeTruthy();
    expect(screen.getByRole('button', { name: '×1' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '×5' }));
    expect(setMissionClock).toHaveBeenLastCalledWith({ speed: 5, paused: false });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(setMissionClock).toHaveBeenLastCalledWith({ paused: true });
  });

  it('offers resume while paused', () => {
    useMissionStore.setState({ clock: { ...running, paused: true } });
    render(<MissionClock />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(setMissionClock).toHaveBeenLastCalledWith({ paused: false });
  });
});
