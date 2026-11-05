import { fireEvent, render, screen } from '@testing-library/react';
import { BattleSettings } from './BattleSettings';
import { DEFAULT_ODDS } from '../../../shared/mission/odds';
import { useMissionStore } from './missionStore';

const resetStore = () =>
  useMissionStore.setState({
    phase: 'idle',
    odds: DEFAULT_ODDS,
    enemyCounts: { infantry: 12, position: 8, vehicle: 10, artillery: 6, air_defense: 4, ew: 4, radar: 2 },
    allyCounts: { infantry: 6, vehicle: 2, artillery: 2, air_defense: 2, ew: 0, position: 0, radar: 0 },
    placed: [],
    placing: null,
  });

describe('BattleSettings', () => {
  beforeEach(resetStore);

  it('shows the odds in percent, and a change is stored as a share and kept at most 100% for one strike', () => {
    render(<BattleSettings onClose={() => {}} />);
    const destroyed = screen.getByLabelText('Vehicle: destroyed, %') as HTMLInputElement;
    expect(destroyed.value).toBe('40');
    fireEvent.change(destroyed, { target: { value: '70' } });
    // Destroyed 70% leaves 30% for damaged, which was 50%.
    const vehicle = useMissionStore.getState().odds.vehicle;
    expect(vehicle.destroyed).toBeCloseTo(0.7);
    expect(vehicle.damaged).toBeCloseTo(0.3);
    fireEvent.change(screen.getByLabelText('Infantry shoots the drone down, %'), { target: { value: '35' } });
    expect(useMissionStore.getState().odds.infantryShootsDown).toBeCloseTo(0.35);
  });

  it('changes the count of a kind on each side', () => {
    render(<BattleSettings onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Enemy: armoured vehicles'), { target: { value: '7' } });
    expect(useMissionStore.getState().enemyCounts.vehicle).toBe(7);
    fireEvent.change(screen.getByLabelText('Ally: infantry'), { target: { value: '3' } });
    expect(useMissionStore.getState().allyCounts.infantry).toBe(3);
  });

  it('starts placing a kind on the side from the button, and stops it again', () => {
    render(<BattleSettings onClose={() => {}} />);
    const place = screen.getAllByRole('button', { name: 'Place on map' })[0];
    fireEvent.click(place);
    expect(useMissionStore.getState().placing).toEqual({ side: 'enemy', kind: 'infantry' });
    expect(screen.getByRole('button', { name: 'Stop placing' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop placing' }));
    expect(useMissionStore.getState().placing).toBeNull();
  });

  it('lists the units placed by hand, and removes one', () => {
    useMissionStore.setState({ placed: [{ side: 'enemy', kind: 'radar', position: { lat: 50.1, lng: 30 } }, { side: 'ally', kind: 'infantry', position: { lat: 50.2, lng: 30 } }] });
    render(<BattleSettings onClose={() => {}} />);
    expect(screen.getByText(/Enemy: radar · 50\.1000, 30\.0000/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(useMissionStore.getState().placed).toEqual([{ side: 'ally', kind: 'infantry', position: { lat: 50.2, lng: 30 } }]);
  });

  it('is read-only once the mission runs', () => {
    useMissionStore.setState({ phase: 'running' });
    render(<BattleSettings onClose={() => {}} />);
    expect((screen.getByLabelText('Vehicle: destroyed, %') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('The settings are fixed once the mission runs.')).toBeTruthy();
  });

  it('closes with the close button and with Escape', () => {
    const onClose = vi.fn();
    render(<BattleSettings onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
