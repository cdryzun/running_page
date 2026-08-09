import { fireEvent, render, screen, within } from '@testing-library/react';
import type { SVGProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import YearCharts, { getYearChartPaths } from './index';
import { loadSvgComponent } from '@/utils/svgUtils';

vi.mock('@assets/index', () => ({
  yearStats: {},
  githubYearStats: {},
}));

vi.mock('@/utils/svgUtils', () => ({
  loadSvgComponent: vi.fn(async (_stats: unknown, path: string) => ({
    default: (props: SVGProps<SVGSVGElement>) => (
      <svg
        {...props}
        data-testid={
          path.includes('github') ? 'github-year-chart' : 'year-chart'
        }
      />
    ),
  })),
}));

describe('YearCharts', () => {
  beforeEach(() => {
    window.localStorage.setItem('language', 'zh-CN');
    vi.clearAllMocks();
  });

  it('resolves distinct Chinese and English SVG paths', () => {
    expect(getYearChartPaths('2026', true)).toEqual({
      year: './year_2026_zh.svg',
      github: './github_2026_zh.svg',
    });
    expect(getYearChartPaths('2026', false)).toEqual({
      year: './year_2026.svg',
      github: './github_2026.svg',
    });
  });

  it('keeps both charts left-aligned inside one fixed slot', async () => {
    render(<YearCharts year="2026" />);

    const slot = screen.getByRole('region', { name: '年度图表' });
    expect(slot).toHaveClass(
      'h-72',
      'lg:h-[32rem]',
      'overflow-hidden',
      'mb-4',
      'lg:mb-8'
    );

    const yearChart = await within(slot).findByTestId('year-chart');
    const githubYearChart =
      await within(slot).findByTestId('github-year-chart');

    expect(yearChart.parentElement).toBe(slot);
    expect(githubYearChart.parentElement).toBe(slot);
    expect(yearChart).toHaveClass('block', 'h-2/3', 'w-full');
    expect(githubYearChart).toHaveClass('block', 'h-1/3', 'w-full');
    expect(yearChart).toHaveAttribute('preserveAspectRatio', 'xMinYMid meet');
    expect(githubYearChart).toHaveAttribute(
      'preserveAspectRatio',
      'xMinYMid meet'
    );
  });

  it('does not change layout on pointer movement and omits Total', async () => {
    const { rerender } = render(<YearCharts year="2026" />);
    const slot = screen.getByRole('region', { name: '年度图表' });
    await within(slot).findByTestId('year-chart');
    const yearChart = within(slot).getByTestId('year-chart');

    rerender(<YearCharts year="2026" />);

    expect(await within(slot).findByTestId('year-chart')).toBe(yearChart);
    expect(vi.mocked(loadSvgComponent)).toHaveBeenCalledTimes(2);

    fireEvent.mouseOver(slot);
    fireEvent.mouseOut(slot);

    expect(screen.getByRole('region', { name: '年度图表' })).toBe(slot);

    rerender(<YearCharts year="Total" />);
    expect(screen.queryByRole('region', { name: '年度图表' })).toBeNull();
  });
});
