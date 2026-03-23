import { titleForRun, formatRunTime, Activity, RunIds } from '@/utils/utils';
import { IS_CHINESE, SHOW_ELEVATION_GAIN, type SportTypeFilter } from '@/utils/const';
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
  const rowExtras: string[] = [];
  if (run.elevation_loss !== null && run.elevation_loss !== undefined) {
    rowExtras.push(
      `${IS_CHINESE ? '下降' : 'Loss'} ${(run.elevation_loss * M_TO_ELEV).toFixed(0)}${ELEV_UNIT}`
    );
  }
  if (run.average_watts && run.average_watts > 0) {
    rowExtras.push(
      `${IS_CHINESE ? '功率' : 'Power'} ${run.average_watts.toFixed(0)}W`
    );
  }
  if (run.average_cadence && run.average_cadence > 0) {
    rowExtras.push(
      `${IS_CHINESE ? '踏频' : 'Cad'} ${run.average_cadence.toFixed(0)}rpm`
    );
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
