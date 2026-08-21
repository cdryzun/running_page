import { describe, expect, it, vi } from 'vitest';
import {
  applyMapLabelLanguage,
  setLocalizedMapStyle,
  type MapLabelLanguage,
} from './mapLanguage';

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

  it.each([
    [
      'en',
      ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']],
    ],
    [
      'zh-CN',
      [
        'coalesce',
        ['get', 'name:zh'],
        ['get', 'name_zh-Hans'],
        ['get', 'name_zh'],
        ['get', 'name'],
      ],
    ],
  ] as const)(
    'converts legacy %s name identity functions',
    (language, expected) => {
      const map = {
        getStyle: () => ({
          layers: [
            {
              id: 'legacy-name',
              type: 'symbol',
              layout: { 'text-field': { property: 'name', type: 'identity' } },
            },
          ],
        }),
        setLayoutProperty: vi.fn(),
      };

      applyMapLabelLanguage(map, language as MapLabelLanguage);

      expect(map.setLayoutProperty).toHaveBeenCalledWith(
        'legacy-name',
        'text-field',
        expected
      );
    }
  );
});

describe('setLocalizedMapStyle', () => {
  it.each([
    ['en', 'name:en'],
    ['zh-CN', 'name:zh'],
  ] as const)(
    'applies %s labels when CARTO emits styledata without style.load',
    (language, expectedNameField) => {
      const listeners = new Map<string, Set<() => void>>();
      let styleLoaded = false;
      const emit = (event: string) =>
        listeners.get(event)?.forEach((listener) => listener());
      const map = {
        ...makeMap(),
        isStyleLoaded: () => styleLoaded,
        off: (event: string, listener: () => void) =>
          listeners.get(event)?.delete(listener),
        on: (event: string, listener: () => void) => {
          const eventListeners = listeners.get(event) ?? new Set();
          eventListeners.add(listener);
          listeners.set(event, eventListeners);
        },
        setStyle: vi.fn(() => emit('styledata')),
      };
      const onReady = vi.fn();

      setLocalizedMapStyle(
        map,
        { version: 8 },
        language as MapLabelLanguage,
        onReady
      );
      expect(map.setLayoutProperty).not.toHaveBeenCalled();

      styleLoaded = true;
      emit('idle');

      expect(map.setLayoutProperty).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(map.setLayoutProperty.mock.calls)).toContain(
        expectedNameField
      );
      expect(onReady).toHaveBeenCalledTimes(1);

      emit('styledata');
      emit('style.load');
      expect(onReady).toHaveBeenCalledTimes(1);
    }
  );
});
