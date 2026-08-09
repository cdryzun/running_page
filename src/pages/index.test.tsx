import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const activityState = vi.hoisted(() => ({
  activities: [
    { run_id: 1, start_date_local: '2026-01-01T08:00:00' },
    { run_id: 2, start_date_local: '2025-01-01T08:00:00' },
  ],
  years: ['2026', '2025'],
  thisYear: '2026',
}));

vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/LocationStat', () => ({
  default: () => <div data-testid="location-stat" />,
}));
vi.mock('@/components/RunMap', () => ({
  default: ({
    thisYear,
    geoData,
  }: {
    thisYear: string;
    geoData: { features: unknown[] };
  }) => (
    <div
      data-feature-count={geoData.features.length}
      data-testid="run-map"
      data-year={thisYear}
    />
  ),
}));
vi.mock('@/components/RunTable', () => ({
  default: ({ runs }: { runs: unknown[] }) => (
    <div data-run-count={runs.length} data-testid="run-table" />
  ),
}));
vi.mock('@/components/SVGStat', () => ({
  default: () => <div data-testid="total-svg-stat" />,
}));
vi.mock('@/components/YearsStat', () => ({
  default: ({ year }: { year: string }) => (
    <div data-testid="year-stats" data-year={year} />
  ),
}));
vi.mock('@/hooks/useActivities', () => ({
  default: () => activityState,
}));
vi.mock('@/hooks/useSiteMetadata', () => ({
  default: () => ({ siteTitle: 'Running Page', siteUrl: '/' }),
}));
vi.mock('@/hooks/useInterval', () => ({
  useInterval: vi.fn(),
}));
vi.mock('@/hooks/useTheme', () => ({
  useThemeChangeCounter: () => 0,
}));
vi.mock('@/utils/utils', () => ({
  filterAndSortRuns: (
    activities: Array<{ start_date_local: string }>,
    item: string,
    filter: (run: { start_date_local: string }, value: string) => boolean
  ) => activities.filter((run) => filter(run, item)),
  filterCityRuns: () => true,
  filterSportRuns: () => true,
  filterTitleRuns: () => true,
  filterYearRuns: (run: { start_date_local: string }, year: string) =>
    year === 'Total' || run.start_date_local.startsWith(year),
  geoJsonForRuns: (runs: unknown[]) => ({
    type: 'FeatureCollection',
    features: runs.map(() => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [] },
    })),
  }),
  getBoundsForGeoData: () => ({
    latitude: 0,
    longitude: 0,
    zoom: 10,
  }),
  scrollToMap: vi.fn(),
  sortDateFunc: () => 0,
  titleForShow: () => '',
}));

import Index from './index';

describe('home page startup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T08:00:00Z'));
    activityState.activities = [
      { run_id: 1, start_date_local: '2026-01-01T08:00:00' },
      { run_id: 2, start_date_local: '2025-01-01T08:00:00' },
    ];
    activityState.years = ['2026', '2025'];
    activityState.thisYear = '2026';
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it('opens the current calendar year and filters the map immediately', () => {
    render(<Index />);

    expect(screen.getByTestId('year-stats')).toHaveAttribute(
      'data-year',
      '2026'
    );
    expect(screen.getByTestId('run-map')).toHaveAttribute('data-year', '2026');
    expect(screen.getByTestId('run-map')).toHaveAttribute(
      'data-feature-count',
      '1'
    );
  });

  it('shows the current-year activity table instead of the all-years SVG', () => {
    render(<Index />);

    expect(screen.getByTestId('run-table')).toHaveAttribute(
      'data-run-count',
      '1'
    );
    expect(screen.queryByTestId('total-svg-stat')).toBeNull();
  });

  it('prefers the current calendar year when newer dated data exists', () => {
    activityState.activities = [
      { run_id: 1, start_date_local: '2027-01-01T08:00:00' },
      { run_id: 2, start_date_local: '2026-01-01T08:00:00' },
    ];
    activityState.years = ['2027', '2026'];
    activityState.thisYear = '2027';

    render(<Index />);

    expect(screen.getByTestId('year-stats')).toHaveAttribute(
      'data-year',
      '2026'
    );
    expect(screen.getByTestId('run-map')).toHaveAttribute(
      'data-feature-count',
      '1'
    );
  });

  it('falls back to the latest activity year when the current year is absent', () => {
    activityState.activities = [
      { run_id: 1, start_date_local: '2025-01-01T08:00:00' },
      { run_id: 2, start_date_local: '2024-01-01T08:00:00' },
    ];
    activityState.years = ['2025', '2024'];
    activityState.thisYear = '2025';

    render(<Index />);

    expect(screen.getByTestId('year-stats')).toHaveAttribute(
      'data-year',
      '2025'
    );
    expect(screen.getByTestId('run-map')).toHaveAttribute(
      'data-feature-count',
      '1'
    );
  });
});
