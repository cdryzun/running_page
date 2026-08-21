import { fireEvent, render, screen } from '@testing-library/react';
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

const getActivityRegions = vi.hoisted(() =>
  vi.fn((activities: Array<{ start_date_local: string }>) => ({
    countries: activities.map(
      (run) => `country-${run.start_date_local.slice(0, 4)}`
    ),
    provinces: activities.map((run) => run.start_date_local.slice(0, 4)),
  }))
);

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
    countries = [],
    provinces = [],
  }: {
    thisYear: string;
    geoData: { features: unknown[] };
    countries?: string[];
    provinces?: string[];
  }) => (
    <div
      data-countries={countries.join(',')}
      data-feature-count={geoData.features.length}
      data-provinces={provinces.join(',')}
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
  default: ({
    year,
    onClick,
  }: {
    year: string;
    onClick: (year: string) => void;
  }) => (
    <div data-testid="year-stats" data-year={year}>
      <button type="button" onClick={() => onClick('2025')}>
        Select 2025
      </button>
    </div>
  ),
}));
vi.mock('@/hooks/useActivities', () => ({
  default: () => activityState,
  getActivityRegions,
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
    getActivityRegions.mockClear();
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

  it('derives highlighted regions from the selected year only', () => {
    render(<Index />);

    expect(getActivityRegions).toHaveBeenCalledWith([
      expect.objectContaining({ start_date_local: '2026-01-01T08:00:00' }),
    ]);
    expect(screen.getByTestId('run-map')).toHaveAttribute(
      'data-provinces',
      '2026'
    );
    expect(screen.getByTestId('run-map')).toHaveAttribute(
      'data-countries',
      'country-2026'
    );
  });

  it('updates highlighted regions when the selected year changes', () => {
    render(<Index />);

    fireEvent.click(screen.getByRole('button', { name: 'Select 2025' }));

    expect(screen.getByTestId('run-map')).toHaveAttribute(
      'data-provinces',
      '2025'
    );
    expect(screen.getByTestId('run-map')).toHaveAttribute(
      'data-countries',
      'country-2025'
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
