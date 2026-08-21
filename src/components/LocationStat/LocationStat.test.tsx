import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useActivities', () => ({
  default: () => ({
    cities: { 深圳市: 9_016_000, 肇庆市: 243_000 },
    runPeriod: {
      Cycling: 370,
      '深圳市 复合运动': 1,
      '深圳市 导航': 1,
    },
  }),
}));

vi.mock('@/utils/const', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/const')>();
  return { ...actual, IS_CHINESE: false };
});

import CitiesStat from './CitiesStat';
import PeriodStat from './PeriodStat';

describe('LocationStat English names', () => {
  it('shows English city names while filtering with the original city key', () => {
    const onClick = vi.fn();

    render(<CitiesStat onClick={onClick} />);

    expect(screen.getByText('Shenzhen')).toBeInTheDocument();
    expect(screen.getByText('Zhaoqing')).toBeInTheDocument();
    expect(screen.queryByText('深圳市')).toBeNull();
    fireEvent.click(screen.getByText('Shenzhen'));
    expect(onClick).toHaveBeenCalledWith('深圳市');
  });

  it('shows English activity titles while filtering with the original title', () => {
    const onClick = vi.fn();

    render(<PeriodStat onClick={onClick} />);

    expect(screen.getByText('Cycling')).toBeInTheDocument();
    expect(screen.getByText('Shenzhen Multi-sport')).toBeInTheDocument();
    expect(screen.getByText('Shenzhen Navigation')).toBeInTheDocument();
    expect(screen.queryByText('深圳市 复合运动')).toBeNull();
    fireEvent.click(screen.getByText('Shenzhen Multi-sport'));
    expect(onClick).toHaveBeenCalledWith('深圳市 复合运动');
  });
});
