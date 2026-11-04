import { fireEvent, render, screen } from '@testing-library/react';
import { ZoneReturnButton } from './ZoneReturnButton';
import { registerZoneFitter } from './zoneView';
import { useMissionStore } from './missionStore';

describe('ZoneReturnButton', () => {
  it('appears only when the zone is off screen and calls the fitter', () => {
    const fit = vi.fn();
    registerZoneFitter(fit);
    useMissionStore.setState({ zoneVisible: true });
    const { rerender } = render(<ZoneReturnButton />);
    expect(screen.queryByRole('button', { name: 'Back to mission zone' })).toBeNull();

    useMissionStore.setState({ zoneVisible: false });
    rerender(<ZoneReturnButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to mission zone' }));
    expect(fit).toHaveBeenCalled();

    registerZoneFitter(null);
    useMissionStore.setState({ zoneVisible: true });
  });
});
