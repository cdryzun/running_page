import {
  titleForRun,
  formatRunTime,
  Activity,
  RunIds,
  normalizeActivityType,
} from '@/utils/utils';
import { SHOW_ELEVATION_GAIN, type SportTypeFilter } from '@/utils/const';
import { ELEV_UNIT, M_TO_DIST, M_TO_ELEV } from '@/utils/utils';
import { getActivityPrimaryMetric } from '@/utils/sportMetrics';
import styles from './style.module.css';

interface IRunRowProperties {
  elementIndex: number;
  locateActivity: (_runIds: RunIds) => void;
  run: Activity;
  runIndex: number;
  sportType: SportTypeFilter;
  setRunIndex: (_ndex: number) => void;
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
  const runTime = formatRunTime(run.moving_time);
  const normalizedType = normalizeActivityType(run.type);
  const rowExtras: string[] = [];
  const formatElevation = (meters: number): string =>
    `${(meters * M_TO_ELEV).toFixed(0)}${ELEV_UNIT}`;
  const hasGain =
    run.elevation_gain !== null &&
    run.elevation_gain !== undefined &&
    run.elevation_gain > 0;
  const hasLoss = run.elevation_loss !== null && run.elevation_loss !== undefined;
  const hasPower = run.average_watts !== null && run.average_watts !== undefined;
  const hasCadence =
    run.average_cadence !== null && run.average_cadence !== undefined;

  const elevationGainText = hasGain ? formatElevation(run.elevation_gain as number) : '--';
  const elevationLossText = hasLoss ? formatElevation(run.elevation_loss as number) : '--';
  const powerText = hasPower ? `${(run.average_watts as number).toFixed(0)}W` : '--';
  const cadenceText = hasCadence
    ? `${(run.average_cadence as number).toFixed(0)}rpm`
    : '--';

  if (normalizedType === 'cycling') {
    rowExtras.push(`↑${elevationGainText}`);
    rowExtras.push(`↓${elevationLossText}`);
    rowExtras.push(`⚡${powerText}`);
    rowExtras.push(`⟳${cadenceText}`);
  } else if (normalizedType === 'hiking') {
    rowExtras.push(`↑${elevationGainText}`);
    rowExtras.push(`↓${elevationLossText}`);
  } else {
    if (hasGain) {
      rowExtras.push(`↑${elevationGainText}`);
    }
    if (hasLoss) {
      rowExtras.push(`↓${elevationLossText}`);
    }
    if (hasPower) {
      rowExtras.push(`⚡${powerText}`);
    }
    if (hasCadence) {
      rowExtras.push(`⟳${cadenceText}`);
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
        {rowExtras.length > 0 && (
          <span className={styles.rowMeta}> · {rowExtras.join(' · ')}</span>
        )}
      </td>
      <td>{distance}</td>
      {SHOW_ELEVATION_GAIN && (
        <td>{((run.elevation_gain ?? 0) * M_TO_ELEV).toFixed(1)}</td>
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
      <td>{heartRate ? heartRate.toFixed(0) : '--'}</td>
      <td>{runTime}</td>
      <td className={styles.runDate}>{run.start_date_local}</td>
    </tr>
  );
};

export default RunRow;
