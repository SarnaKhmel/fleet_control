import { fireEvent, render, screen } from '@testing-library/react';
import { Accordion } from './Accordion';

describe('Accordion', () => {
  it('keeps the body mounted and toggles its visibility', () => {
    render(
      <Accordion title="Section">
        <p>Body text</p>
      </Accordion>,
    );
    const head = screen.getByRole('button', { name: /Section/ });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Body text').closest('.accordion-body')?.hasAttribute('hidden')).toBe(true);
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Body text').closest('.accordion-body')?.hasAttribute('hidden')).toBe(false);
  });
});
