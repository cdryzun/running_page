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
    id: 'compound-road-label',
    type: 'symbol',
    layout: {
      'text-field': [
        'format',
        ['get', 'name'],
        {},
        ' / ',
        {},
        ['get', 'ref'],
        {},
      ],
    },
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
    expect(map.setLayoutProperty).toHaveBeenCalledTimes(3);
    expect(map.setLayoutProperty).toHaveBeenNthCalledWith(
      1,
      'city-label',
      'text-field',
      ['step', ['zoom'], englishName, 13, englishName]
    );
    expect(map.setLayoutProperty).toHaveBeenNthCalledWith(
      2,
      'road-label',
      'text-field',
      englishName
    );
    expect(map.setLayoutProperty).toHaveBeenNthCalledWith(
      3,
      'compound-road-label',
      'text-field',
      ['format', englishName, {}, ' / ', {}, ['get', 'ref'], {}]
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
    expect(map.setLayoutProperty).toHaveBeenCalledTimes(3);
    expect(map.setLayoutProperty).toHaveBeenNthCalledWith(
      1,
      'city-label',
      'text-field',
      ['step', ['zoom'], chineseName, 13, chineseName]
    );
    expect(map.setLayoutProperty).toHaveBeenNthCalledWith(
      2,
      'road-label',
      'text-field',
      chineseName
    );
    expect(map.setLayoutProperty).toHaveBeenNthCalledWith(
      3,
      'compound-road-label',
      'text-field',
      ['format', chineseName, {}, ' / ', {}, ['get', 'ref'], {}]
    );
  });
});
