import { IS_CHINESE, type SportTypeFilter } from './const';
import {
  DIST_UNIT,
  M_TO_DIST,
  formatPace,
  normalizeActivityType,
  type Activity,
} from './utils';

type PrimaryMetricKind = 'pace' | 'speed';
type SportMetricsMode = 'legacy' | 'adaptive';

interface PrimaryMetricDisplay {
  label: string;
  value: string;
  auxiliaryValue?: string;
  sortValue: number | null;
}

const metricsMode: SportMetricsMode =
  import.meta.env.VITE_SPORT_METRICS_MODE === 'legacy' ? 'legacy' : 'adaptive';

const METRIC_LABELS = {
  pace: IS_CHINESE ? '配速' : 'Pace',
  speed: IS_CHINESE ? '速度' : 'Speed',
  metric: IS_CHINESE ? '指标' : 'Metric',
  avgPace: IS_CHINESE ? '平均配速' : 'Avg Pace',
  avgSpeed: IS_CHINESE ? '平均速度' : 'Avg Speed',
  avgMetric: IS_CHINESE ? '平均指标' : 'Avg Metric',
};

const isValidSpeed = (speed?: number | null): speed is number =>
  typeof speed === 'number' && Number.isFinite(speed) && speed > 0;

const toDistPerHour = (speedMps: number): number =>
  (speedMps * 3600) / M_TO_DIST;

const formatSpeed = (speedMps: number): string =>
  `${toDistPerHour(speedMps).toFixed(1)} ${DIST_UNIT}/h`;

const formatPaceMetric = (speedMps: number): string => formatPace(speedMps);

const formatSpeedMetric = (speedMps: number): string => formatSpeed(speedMps);

const kindForNormalizedSport = (normalizedSport: string): PrimaryMetricKind => {
  if (['running', 'walking', 'hiking'].includes(normalizedSport)) {
    return 'pace';
  }
  return 'speed';
};

const getPrimaryMetricKindForFilter = (
  sportType: SportTypeFilter
): PrimaryMetricKind | null => {
  if (metricsMode === 'legacy') {
    return 'pace';
  }
  if (sportType === 'all') {
    return null;
  }
  return kindForNormalizedSport(sportType);
};

const getPrimaryMetricKindForRun = (
  run: Activity,
  sportType: SportTypeFilter
): PrimaryMetricKind => {
  if (metricsMode === 'legacy') {
    return 'pace';
  }
  const filterKind = getPrimaryMetricKindForFilter(sportType);
  if (filterKind) {
    return filterKind;
  }
  return kindForNormalizedSport(normalizeActivityType(run.type));
};

const getPrimaryMetricLabel = (sportType: SportTypeFilter): string => {
  const kind = getPrimaryMetricKindForFilter(sportType);
  if (!kind) {
    return METRIC_LABELS.metric;
  }
  return kind === 'pace' ? METRIC_LABELS.pace : METRIC_LABELS.speed;
};

const getAveragePrimaryMetricLabel = (sportType: SportTypeFilter): string => {
  const kind = getPrimaryMetricKindForFilter(sportType);
  if (!kind) {
    return METRIC_LABELS.avgMetric;
  }
  return kind === 'pace' ? METRIC_LABELS.avgPace : METRIC_LABELS.avgSpeed;
};

const isPacePrimaryForSportType = (
  sportType: SportTypeFilter
): boolean | null => {
  const kind = getPrimaryMetricKindForFilter(sportType);
  if (!kind) {
    return null;
  }
  return kind === 'pace';
};

const formatAveragePrimaryMetric = (
  averageSpeed: number,
  sportType: SportTypeFilter
): string => {
  if (!isValidSpeed(averageSpeed)) {
    return '--';
  }
  const kind = getPrimaryMetricKindForFilter(sportType);
  if (kind === 'pace') {
    return formatPace(averageSpeed);
  }
  return formatSpeed(averageSpeed);
};

const getActivityPrimaryMetric = (
  run: Activity,
  sportType: SportTypeFilter
): PrimaryMetricDisplay => {
  const kind = getPrimaryMetricKindForRun(run, sportType);
  const label = kind === 'pace' ? METRIC_LABELS.pace : METRIC_LABELS.speed;

  if (!isValidSpeed(run.average_speed)) {
    return {
      label,
      value: '--',
      sortValue: null,
    };
  }

  if (kind === 'pace') {
    return {
      label,
      value: formatPace(run.average_speed),
      auxiliaryValue:
        metricsMode === 'adaptive' ? formatSpeed(run.average_speed) : undefined,
      sortValue: run.average_speed,
    };
  }

  return {
    label,
    value: formatSpeed(run.average_speed),
    auxiliaryValue:
      metricsMode === 'adaptive' ? formatPace(run.average_speed) : undefined,
    sortValue: run.average_speed,
  };
};

const getPrimaryMetricSortValue = (
  run: Activity,
  sportType: SportTypeFilter
): number | null => {
  return getActivityPrimaryMetric(run, sportType).sortValue;
};

export {
  formatAveragePrimaryMetric,
  formatPaceMetric,
  formatSpeedMetric,
  getActivityPrimaryMetric,
  getAveragePrimaryMetricLabel,
  getPrimaryMetricLabel,
  getPrimaryMetricSortValue,
  isPacePrimaryForSportType,
};
