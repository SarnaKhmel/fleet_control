import { fireEvent, render, screen } from '@testing-library/react';
import { AttackControls } from './AttackControls';
import { useMissionStore } from '../mission/missionStore';
import { engageEnemy } from '../mission/missionSocket';

vi.mock('../mission/missionSocket', () => ({ engageEnemy: vi.fn() }));

const enemy = (id: string, kind: 'vehicle' | 'infantry') => ({
  id, side: 'enemy' as const, kind, position: { lat: 50.1, lng: 30 }, headingDeg: null, speedMs: 0, source: 'intel' as const, detectedByDroneId: null, inSight: false,
});

describe('AttackControls', () => {
  beforeEach(() => {
    vi.mocked(engageEnemy).mockClear();
    useMissionStore.setState({ units: {} });
  });

  it('says so when no enemy unit is known yet', () => {
    render(<AttackControls droneId="drone-1" />);
    expect(screen.getByText('No enemy unit is known yet.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lists only the known enemy units, and sends the drone at the chosen one in the chosen mode', () => {
    useMissionStore.setState({
      units: {
        'enemy-1': enemy('enemy-1', 'vehicle'),
        'enemy-2': enemy('enemy-2', 'infantry'),
        'ally-1': { ...enemy('ally-1', 'infantry'), side: 'ally' },
      },
    });
    render(<AttackControls droneId="drone-1" />);
    const target = screen.getByLabelText('Enemy unit') as HTMLSelectElement;
    expect(Array.from(target.options).map((o) => o.value)).toEqual(['enemy-1', 'enemy-2']);
    fireEvent.change(target, { target: { value: 'enemy-2' } });
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'pursuit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Attack' }));
    expect(engageEnemy).toHaveBeenCalledWith('drone-1', 'enemy-2', 'pursuit');
  });

  it('strikes the first known unit by default', () => {
    useMissionStore.setState({ units: { 'enemy-1': enemy('enemy-1', 'vehicle') } });
    render(<AttackControls droneId="drone-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Attack' }));
    expect(engageEnemy).toHaveBeenCalledWith('drone-1', 'enemy-1', 'strike');
  });
});
