export type MapLabelLanguage = 'en' | 'zh-CN';

type MapStyleLayer = {
  id: string;
  type?: string;
  layout?: object;
};

type MapLabelTarget = {
  getStyle: () => { layers?: MapStyleLayer[] };
  setLayoutProperty: (
    layerId: string,
    property: 'text-field',
    value: unknown
  ) => void;
};

const containsNameField = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return /(?:^|\{)name(?=[:_}]|$)/.test(value) || value === 'name';
  }
  if (Array.isArray(value)) {
    return value.some(containsNameField);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(containsNameField);
  }
  return false;
};

const localizedNameExpression = (language: MapLabelLanguage): unknown[] =>
  language === 'en'
    ? ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']]
    : [
        'coalesce',
        ['get', 'name:zh'],
        ['get', 'name_zh-Hans'],
        ['get', 'name_zh'],
        ['get', 'name'],
      ];

export const applyMapLabelLanguage = (
  map: MapLabelTarget,
  language: MapLabelLanguage
): void => {
  const textField = localizedNameExpression(language);
  for (const layer of map.getStyle().layers ?? []) {
    const currentTextField =
      layer.layout && 'text-field' in layer.layout
        ? layer.layout['text-field']
        : undefined;
    if (layer.type === 'symbol' && containsNameField(currentTextField)) {
      map.setLayoutProperty(layer.id, 'text-field', textField);
    }
  }
};
