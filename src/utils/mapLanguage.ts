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

const NAME_PROPERTY_PATTERN = /^name(?=[:_]|$)/;

const isNameProperty = (value: unknown): value is string =>
  typeof value === 'string' && NAME_PROPERTY_PATTERN.test(value);

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

const isGetNameExpression = (value: unknown): boolean =>
  Array.isArray(value) && value[0] === 'get' && isNameProperty(value[1]);

const isPureNameExpression = (value: unknown): boolean =>
  Array.isArray(value) &&
  value[0] === 'coalesce' &&
  value.length > 1 &&
  value.slice(1).every(isGetNameExpression);

const localizeTokenString = (
  value: string,
  nameExpression: unknown[]
): unknown => {
  const matches = [...value.matchAll(/\{([^}]+)\}/g)];
  if (!matches.some((match) => isNameProperty(match[1]))) {
    return value;
  }

  const parts: unknown[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    const startIndex = match.index ?? 0;
    if (startIndex > lastIndex) parts.push(value.slice(lastIndex, startIndex));
    parts.push(isNameProperty(match[1]) ? nameExpression : ['get', match[1]]);
    lastIndex = startIndex + match[0].length;
  }
  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return parts.length === 1 ? parts[0] : ['concat', ...parts];
};

const localizeTextField = (
  value: unknown,
  nameExpression: unknown[]
): unknown => {
  if (typeof value === 'string') {
    return localizeTokenString(value, nameExpression);
  }
  if (Array.isArray(value)) {
    if (isGetNameExpression(value) || isPureNameExpression(value)) {
      return nameExpression;
    }
    if (value[0] === 'literal') return value;
    return value.map((item) => localizeTextField(item, nameExpression));
  }
  if (typeof value !== 'object' || value === null) return value;

  const record = value as Record<string, unknown>;
  const stops = record.stops;
  if (Array.isArray(stops) && !('property' in record)) {
    const validStops = stops.filter(
      (stop): stop is [number, unknown] =>
        Array.isArray(stop) && typeof stop[0] === 'number' && stop.length >= 2
    );
    if (validStops.length === stops.length && validStops.length > 0) {
      const expression: unknown[] = [
        'step',
        ['zoom'],
        localizeTextField(validStops[0][1], nameExpression),
      ];
      for (const [zoom, output] of validStops.slice(1)) {
        expression.push(zoom, localizeTextField(output, nameExpression));
      }
      return expression;
    }
  }

  if (!containsNameField(record)) return value;
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      localizeTextField(item, nameExpression),
    ])
  );
};

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
      map.setLayoutProperty(
        layer.id,
        'text-field',
        localizeTextField(currentTextField, textField)
      );
    }
  }
};
