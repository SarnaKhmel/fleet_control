import { act, fireEvent, render, screen } from '@testing-library/react';
import { MissionPanel } from './MissionPanel';
import { useMissionStore } from './missionStore';
import * as socket from './missionSocket';

describe('MissionPanel', () => {
  beforeEach(() => {
    useMissionStore.setState({ center: null, widthKm: 200, heightKm: 200, layoutKind: 'single', points: [], picking: false, phase: 'idle', drones: {}, error: null });
  });

  it('keeps Start disabled until the picks are complete and inside the area', () => {
    render(<MissionPanel />);
    expect((screen.getByRole('button', { name: 'Start mission' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => useMissionStore.getState().addPoint({ lat: 50.45, lng: 30.52 }));
    expect((screen.getByRole('button', { name: 'Start mission' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends mission_start with the area and layout', () => {
    const send = vi.spyOn(socket, 'sendClientMessage').mockReturnValue(true);
    render(<MissionPanel />);
    act(() => useMissionStore.getState().addPoint({ lat: 50.45, lng: 30.52 }));
    fireEvent.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mission_start', layout: { kind: 'single', point: { lat: 50.45, lng: 30.52 } } }),
    );
    expect(useMissionStore.getState().phase).toBe('running');
    send.mockRestore();
  });

  it('shows a notice when the server is not connected', () => {
    const send = vi.spyOn(socket, 'sendClientMessage').mockReturnValue(false);
    render(<MissionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset mission' }));
    expect(screen.getByRole('alert').textContent).toBe('Not connected to the server');
    send.mockRestore();
  });

  it('asks for a second press before resetting a running mission', () => {
    const send = vi.spyOn(socket, 'sendClientMessage').mockReturnValue(true);
    useMissionStore.setState({ phase: 'running' });
    render(<MissionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset mission' }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Confirm reset/ }));
    expect(send).toHaveBeenCalledWith({ type: 'mission_reset' });
    send.mockRestore();
    useMissionStore.setState({ phase: 'idle' });
  });
});
