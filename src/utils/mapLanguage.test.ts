import { describe, expect, it, vi } from 'vitest';
import { applyMapLabelLanguage } from './mapLanguage';

const styleLayers = [
  {
    id: 'city-label',
    type: 'symbol',
    layout: {
      'text-field': {
        stops: [
          [8, '{name_en}'],
          [13, '{name}'],
        ],
      },
    },
  },
  {
    id: 'road-label',
    type: 'symbol',
    layout: { 'text-field': '{name}' },
  },
  {
    id: 'house-number',
    type: 'symbol',
    layout: { 'text-field': '{housenumber}' },
  },
  {
    id: 'province-fill',
    type: 'fill',
    layout: {},
  },
];

const makeMap = () => ({
  getStyle: () => ({ layers: styleLayers }),
  setLayoutProperty: vi.fn(),
});

describe('applyMapLabelLanguage', () => {
  it('forces every name label to English at all zoom levels', () => {
    const map = makeMap();

    applyMapLabelLanguage(map, 'en');

    const englishName = [
      'coalesce',
      ['get', 'name:en'],
      ['get', 'name_en'],
      ['get', 'name'],
    ];
    expect(map.setLayoutProperty).toHaveBeenCalledTimes(2);
    expect(map.setLayoutProperty).toHaveBeenNthCalledWith(
      1,
      'city-label',
      'text-field',
      englishName
    );
    expect(map.setLayoutProperty).toHaveBeenNthCalledWith(
      2,
      'road-label',
      'text-field',
      englishName
    );
  });

  it('forces every name label to Simplified Chinese at all zoom levels', () => {
    const map = makeMap();

    applyMapLabelLanguage(map, 'zh-CN');

    const chineseName = [
      'coalesce',
      ['get', 'name:zh'],
      ['get', 'name_zh-Hans'],
      ['get', 'name_zh'],
      ['get', 'name'],
    ];
    expect(map.setLayoutProperty).toHaveBeenCalledTimes(2);
    expect(map.setLayoutProperty).toHaveBeenNthCalledWith(
      1,
      'city-label',
      'text-field',
      chineseName
    );
    expect(map.setLayoutProperty).toHaveBeenNthCalledWith(
      2,
      'road-label',
      'text-field',
      chineseName
    );
  });
});
