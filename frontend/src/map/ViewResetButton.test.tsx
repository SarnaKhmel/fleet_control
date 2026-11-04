import { fireEvent, render, screen } from '@testing-library/react';
import { ViewResetButton } from './ViewResetButton';
import { registerViewReset } from './viewReset';

describe('ViewResetButton', () => {
  it('calls the registered reset when clicked', () => {
    const reset = vi.fn();
    registerViewReset(reset);
    render(<ViewResetButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Default view' }));
    expect(reset).toHaveBeenCalledTimes(1);
    registerViewReset(null);
  });
});
