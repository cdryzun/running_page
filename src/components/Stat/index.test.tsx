import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Stat from './index';

describe('Stat', () => {
  it('keeps the value and trimmed description in an explicit wrapping layout', () => {
    const { container } = render(
      <Stat value="7,195.1" description="  Average speed  " />
    );

    const root = container.firstElementChild;
    const description = screen.getByText('Average speed');

    expect(root).toHaveClass(
      'flex',
      'flex-wrap',
      'items-baseline',
      'gap-x-2',
      'gap-y-1'
    );
    expect(description.textContent).toBe('Average speed');
  });
});
