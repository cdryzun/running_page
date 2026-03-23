import { titleForRun, formatRunTime, Activity, RunIds } from '@/utils/utils';
import { SHOW_ELEVATION_GAIN, type SportTypeFilter } from '@/utils/const';
import { M_TO_DIST, M_TO_ELEV } from '@/utils/utils';
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
      <td>{titleForRun(run)}</td>
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
