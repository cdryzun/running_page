import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import YearStat from './index';
import YearsStat from '@/components/YearsStat';
import type { Activity } from '@/utils/utils';

const activityState = vi.hoisted(
  (): { activities: Activity[]; years: string[] } => ({
    activities: [],
    years: ['2024', '2025'],
  })
);

vi.mock('@/hooks/useActivities', () => ({
  default: () => activityState,
}));

vi.mock('@assets/index', () => ({
  yearStats: {},
  githubYearStats: {},
}));

vi.mock('@/utils/svgUtils', () => ({
  loadSvgComponent: vi.fn(async (_stats: unknown, path: string) => ({
    default: ({ className }: { className?: string }) => (
      <svg
        className={className}
        data-testid={
          path.includes('github') ? 'github-year-chart' : 'year-chart'
        }
      />
    ),
  })),
}));

const makeActivity = (
  runId: number,
  overrides: Partial<Activity> = {}
): Activity => ({
  run_id: runId,
  name: `Activity ${runId}`,
  distance: 0,
  moving_time: '3600',
  type: 'running',
  subtype: '',
  start_date: '2025-01-01T00:00:00Z',
  start_date_local: '2025-01-01T08:00:00',
  elevation_gain: null,
  elevation_loss: null,
  average_speed: 0,
  streak: 0,
  ...overrides,
});

const statPairs = (container: HTMLElement): string[][] =>
  [...container.querySelectorAll('section > div')].map((node) =>
    [...node.querySelectorAll(':scope > span')].map((span) =>
      (span.textContent ?? '').trim()
    )
  );

describe('YearStat charts', () => {
  beforeEach(() => {
    window.localStorage.setItem('language', 'zh-CN');
    activityState.activities = [];
    activityState.years = ['2024', '2025'];
  });

  it('keeps both selected-year charts inside one fixed slot', async () => {
    render(
      <YearStat year="2025" onClick={vi.fn()} sportType="all" showCharts />
    );

    const slot = screen.getByRole('region', { name: '年度图表' });
    expect(slot).toHaveClass('h-72', 'lg:h-[32rem]', 'overflow-hidden');
    const yearChart = await within(slot).findByTestId('year-chart');
    const githubYearChart =
      await within(slot).findByTestId('github-year-chart');
    expect(yearChart.parentElement).toBe(slot);
    expect(githubYearChart.parentElement).toBe(slot);
    expect(yearChart).toHaveClass('block', 'h-2/3', 'w-full');
    expect(githubYearChart).toHaveClass('block', 'h-1/3', 'w-full');
  });

  it('does not mount or unmount the selected chart slot on pointer movement', async () => {
    const { container } = render(
      <YearStat year="2025" onClick={vi.fn()} sportType="all" showCharts />
    );
    const section = container.querySelector('section');
    const slot = screen.getByRole('region', { name: '年度图表' });
    await within(slot).findByTestId('year-chart');

    fireEvent.mouseOver(section as Element);
    fireEvent.mouseOut(section as Element);

    expect(screen.getByRole('region', { name: '年度图表' })).toBe(slot);
    expect(within(slot).getByTestId('year-chart')).toBeInTheDocument();
    expect(within(slot).getByTestId('github-year-chart')).toBeInTheDocument();
  });

  it('does not reserve chart space for non-selected or total summaries', () => {
    const { rerender } = render(
      <YearStat
        year="2024"
        onClick={vi.fn()}
        sportType="all"
        showCharts={false}
      />
    );
    expect(screen.queryByRole('region', { name: '年度图表' })).toBeNull();

    rerender(
      <YearStat year="Total" onClick={vi.fn()} sportType="all" showCharts />
    );
    expect(screen.queryByRole('region', { name: '年度图表' })).toBeNull();
  });

  it('lets YearsStat reserve exactly one chart slot for the selected year', async () => {
    render(<YearsStat year="2025" onClick={vi.fn()} sportType="all" />);

    expect(
      await screen.findAllByRole('region', { name: '年度图表' })
    ).toHaveLength(1);
  });

  it('calculates complete metrics and filters them by sport without losing labels', () => {
    activityState.activities = [
      makeActivity(1, {
        distance: 10_000,
        type: 'cycling',
        elevation_gain: 100,
        elevation_loss: 80,
        max_elevation: 500,
        min_elevation: -20,
        average_speed: 5,
        average_heartrate: 140,
        average_watts: 200,
        weighted_average_watts: 220,
        max_watts: 500,
        average_cadence: 90,
        max_cadence: 110,
        streak: 3,
      }),
      makeActivity(2, {
        distance: 4_000,
        type: 'cycling',
        elevation_gain: 50,
        elevation_loss: null,
        max_elevation: 400,
        min_elevation: -10,
        average_speed: 4,
        average_heartrate: 100,
        average_watts: 100,
        weighted_average_watts: 120,
        max_watts: 300,
        average_cadence: 80,
        max_cadence: 100,
        streak: 5,
      }),
      makeActivity(3, {
        distance: 1_000,
        elevation_gain: 20,
        elevation_loss: 10,
      }),
      makeActivity(4, {
        distance: 99_000,
        start_date_local: '2024-01-01T08:00:00',
        elevation_gain: 999,
        elevation_loss: 999,
        average_speed: 9,
      }),
    ];
    const onClick = vi.fn();
    const { container, rerender } = render(
      <YearStat year="2025" onClick={onClick} sportType="all" />
    );

    expect(statPairs(container)).toEqual(
      expect.arrayContaining([
        ['3', '次活动'],
        ['15', 'km'],
        ['170', '海拔爬升 (m)'],
        ['140', '海拔下降 (m)'],
        ['500', '最高海拔 (m)'],
        ['-20', '最低海拔 (m)'],
        ['120', '平均心率'],
        ['150', '平均功率 (W)'],
        ['170', '加权功率 (W)'],
        ['500', '最大功率 (W)'],
      ])
    );
    fireEvent.click(screen.getByText('2025'));
    expect(onClick).toHaveBeenCalledWith('2025');

    rerender(<YearStat year="2025" onClick={onClick} sportType="cycling" />);
    expect(statPairs(container)).toEqual(
      expect.arrayContaining([
        ['2', '次活动'],
        ['85', '平均踏频 (rpm)'],
        ['110', '最大踏频 (rpm)'],
      ])
    );
  });
});
