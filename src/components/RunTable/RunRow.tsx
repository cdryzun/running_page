import {
  titleForRun,
  formatRunTime,
  Activity,
  RunIds,
  normalizeActivityType,
} from '@/utils/utils';
import {
  IS_CHINESE,
  SHOW_ELEVATION_GAIN,
  type SportTypeFilter,
} from '@/utils/const';
import { ELEV_UNIT, M_TO_DIST, M_TO_ELEV } from '@/utils/utils';
import {
  getActivityPrimaryMetric,
  getCadenceUnitForNormalizedSport,
} from '@/utils/sportMetrics';
import styles from './style.module.css';

interface IRunRowProperties {
  elementIndex: number;
  locateActivity: (_runIds: RunIds) => void;
  run: Activity;
  runIndex: number;
  sportType: SportTypeFilter;
  setRunIndex: (_ndex: number) => void;
}

interface RowMetaItem {
  key: string;
  icon: string;
  value: string;
  estimated?: boolean;
}

const RunRow = ({
  elementIndex,
  locateActivity,
  run,
  runIndex,
  sportType,
  setRunIndex,
}: IRunRowProperties) => {
  const distance = (run.distance / M_TO_DIST).toFixed(2);
  const primaryMetric = getActivityPrimaryMetric(run, sportType);
  const heartRate = run.average_heartrate;
  const hasHeartRate = heartRate !== null && heartRate !== undefined;
  const runTime = formatRunTime(run.moving_time);
  const normalizedType = normalizeActivityType(run.type);
  const rowMetaItems: RowMetaItem[] = [];
  const formatElevation = (meters: number): string =>
    `${(meters * M_TO_ELEV).toFixed(0)}${ELEV_UNIT}`;
  const hasGainValue =
    run.elevation_gain !== null && run.elevation_gain !== undefined;
  const hasLossValue =
    run.elevation_loss !== null && run.elevation_loss !== undefined;
  const hasPositiveGain = hasGainValue && (run.elevation_gain as number) > 0;
  const hasPositiveLoss = hasLossValue && (run.elevation_loss as number) > 0;
  const hasPower =
    run.average_watts !== null &&
    run.average_watts !== undefined &&
    run.average_watts > 0;
  const hasCadence =
    run.average_cadence !== null &&
    run.average_cadence !== undefined &&
    run.average_cadence > 0;
  const canEstimateElevation =
    normalizedType === 'cycling' || normalizedType === 'hiking';
  const gainEstimated = !hasGainValue && hasLossValue && canEstimateElevation;
  const lossEstimated = !hasLossValue && hasGainValue && canEstimateElevation;

  const elevationGainText = hasGainValue
    ? formatElevation(run.elevation_gain as number)
    : gainEstimated
      ? `~${formatElevation(run.elevation_loss as number)}`
      : '--';
  const elevationLossText = hasLossValue
    ? formatElevation(run.elevation_loss as number)
    : lossEstimated
      ? `~${formatElevation(run.elevation_gain as number)}`
      : '--';
  const powerText = hasPower
    ? `${(run.average_watts as number).toFixed(0)}W`
    : '--';
  const cadenceUnit = getCadenceUnitForNormalizedSport(normalizedType);
  const cadenceText = hasCadence
    ? `${(run.average_cadence as number).toFixed(0)}${cadenceUnit}`
    : '--';
  const addMeta = (
    key: string,
    icon: string,
    value: string,
    estimated = false
  ) => rowMetaItems.push({ key, icon, value, estimated });

  if (normalizedType === 'cycling') {
    addMeta('gain', '↑', elevationGainText, gainEstimated);
    addMeta('loss', '↓', elevationLossText, lossEstimated);
    addMeta('power', '⚡', powerText);
    addMeta('cadence', '⟳', cadenceText);
  } else if (normalizedType === 'hiking') {
    addMeta('gain', '↑', elevationGainText, gainEstimated);
    addMeta('loss', '↓', elevationLossText, lossEstimated);
  } else {
    if (hasPositiveGain) {
      addMeta('gain', '↑', elevationGainText);
    }
    if (hasPositiveLoss) {
      addMeta('loss', '↓', elevationLossText);
    }
    if (hasPower) {
      addMeta('power', '⚡', powerText);
    }
    if (hasCadence) {
      addMeta('cadence', '⟳', cadenceText);
    }
  }
  const handleClick = () => {
    if (runIndex === elementIndex) {
      setRunIndex(-1);
      locateActivity([]);
      return;
    }
    setRunIndex(elementIndex);
    locateActivity([run.run_id]);
  };

  return (
    <tr
      className={`${styles.runRow} ${runIndex === elementIndex ? styles.selected : ''}`}
      key={run.start_date_local}
      onClick={handleClick}
    >
      <td>
        {titleForRun(run)}
        {rowMetaItems.length > 0 && (
          <span className={styles.rowMeta}>
            {rowMetaItems.map((item, idx) => (
              <span
                key={`${item.key}-${idx}`}
                className={`${styles.metaSlot} ${
                  item.estimated ? styles.metaSlotEstimated : ''
                }`}
                title={
                  item.estimated
                    ? IS_CHINESE
                      ? '估算值（原始上升/下降缺失）'
                      : 'Estimated (source ascent/descent missing)'
                    : undefined
                }
              >
                <span className={styles.metaIcon}>{item.icon}</span>
                <span className={styles.metaValue}>{item.value}</span>
              </span>
            ))}
          </span>
        )}
      </td>
      <td>{distance}</td>
      {SHOW_ELEVATION_GAIN && (
        <td>
          {hasGainValue
            ? ((run.elevation_gain as number) * M_TO_ELEV).toFixed(1)
            : '--'}
        </td>
      )}
      <td title={primaryMetric.label}>
        {primaryMetric.value}
        {primaryMetric.auxiliaryValue && (
          <span className={styles.metricAux}>
            {' '}
            {primaryMetric.auxiliaryValue}
          </span>
        )}
      </td>
      <td>{hasHeartRate ? heartRate.toFixed(0) : '--'}</td>
      <td>{runTime}</td>
      <td className={styles.runDate}>{run.start_date_local}</td>
    </tr>
  );
};

export default RunRow;
