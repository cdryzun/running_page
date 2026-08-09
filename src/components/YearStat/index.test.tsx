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

  it('does not mix charts into an individual year summary', () => {
    render(<YearStat year="2025" onClick={vi.fn()} sportType="all" />);

    expect(screen.queryByRole('region', { name: '年度图表' })).toBeNull();
  });

  it('places selected-year charts before overview copy and yearly summaries', async () => {
    const { container } = render(
      <YearsStat year="2025" onClick={vi.fn()} sportType="all" />
    );

    const slot = await screen.findByRole('region', { name: '年度图表' });
    const wrapper = container.firstElementChild;
    expect(wrapper?.firstElementChild).toBe(slot);
    expect(await within(slot).findByTestId('year-chart')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
  });

  it('does not show annual charts for the Total overview', () => {
    render(<YearsStat year="Total" onClick={vi.fn()} sportType="all" />);

    expect(screen.queryByRole('region', { name: '年度图表' })).toBeNull();
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
