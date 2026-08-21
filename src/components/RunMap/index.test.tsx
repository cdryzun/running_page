import { render, screen, waitFor } from '@testing-library/react';
import type { FeatureCollection } from 'geojson';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RPGeometry } from '@/static/run_countries';

const geoJsonForMap = vi.hoisted(() => vi.fn());

vi.mock('react-map-gl', async () => {
  const React = await import('react');
  const MockMap = React.forwardRef<never, { children: ReactNode }>(
    ({ children }, _ref) => <div data-testid="map">{children}</div>
  );
  MockMap.displayName = 'MockMap';

  return {
    default: MockMap,
    Source: ({
      children,
      data,
    }: {
      children: ReactNode;
      data: FeatureCollection<RPGeometry>;
    }) => (
      <div
        data-feature-count={data.features.length}
        data-geometry-types={data.features
          .map((feature) => feature.geometry.type)
          .join(',')}
        data-testid="map-source"
      >
        {children}
      </div>
    ),
    Layer: ({ id }: { id: string }) => <div data-testid={`layer-${id}`} />,
    FullscreenControl: () => null,
    NavigationControl: () => null,
  };
});

vi.mock('@/hooks/useActivities', () => ({
  default: () => ({ countries: ['中国'], provinces: ['广东省'] }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useMapTheme: () => 'dark-matter',
  useThemeChangeCounter: () => 0,
}));

vi.mock('@/utils/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/utils')>();
  return {
    ...actual,
    geoJsonForMap,
    getMapStyle: () => ({ version: 8, sources: {}, layers: [] }),
    isTouchDevice: () => false,
  };
});

vi.mock('./RunMapButtons', () => ({ default: () => null }));
vi.mock('./RunMarker', () => ({ default: () => null }));
vi.mock('./LightsControl', () => ({ default: () => null }));

import RunMap from './index';

const routeData: FeatureCollection<RPGeometry> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { color: '#4dd2ff', indoor: false },
      geometry: { type: 'LineString', coordinates: [] },
    },
  ],
};

const boundaryData: FeatureCollection<RPGeometry> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: '广东省' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [109, 20],
            [117, 20],
            [117, 25],
            [109, 20],
          ],
        ],
      },
    },
  ],
};

const renderMap = (zoom: number) =>
  render(
    <RunMap
      changeYear={vi.fn()}
      geoData={routeData}
      setViewState={vi.fn()}
      thisYear="2026"
      title="2026 Year Activity Heatmap"
      viewState={{ latitude: 35, longitude: 105, zoom }}
    />
  );

describe('RunMap province highlighting', () => {
  beforeEach(() => {
    window.localStorage.setItem('language', 'en');
    geoJsonForMap.mockReset();
    geoJsonForMap.mockResolvedValue(boundaryData);
  });

  it('loads and merges province boundaries in English when zoomed out', async () => {
    renderMap(3);

    expect(await screen.findByTestId('map-source')).toHaveAttribute(
      'data-feature-count',
      '2'
    );
    expect(screen.getByTestId('map-source')).toHaveAttribute(
      'data-geometry-types',
      'LineString,Polygon'
    );
    expect(screen.getByTestId('layer-province')).toBeInTheDocument();
    expect(geoJsonForMap).toHaveBeenCalledTimes(1);
  });

  it('keeps route data unchanged without loading boundaries when zoomed in', async () => {
    renderMap(4);

    await waitFor(() => expect(geoJsonForMap).not.toHaveBeenCalled());
    expect(screen.getByTestId('map-source')).toHaveAttribute(
      'data-feature-count',
      '1'
    );
    expect(screen.getByTestId('map-source')).toHaveAttribute(
      'data-geometry-types',
      'LineString'
    );
  });
});
