import {
  formatPace,
  titleForRun,
  formatRunTime,
  Activity,
  RunIds,
} from '@/utils/utils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';
import styles from './style.module.css';

interface IRunRowProperties {
  elementIndex: number;
  locateActivity: (_runIds: RunIds) => void;
  run: Activity;
  runIndex: number;
  setRunIndex: (_ndex: number) => void;
  selectedRunId: number | null;
  setSelectedRunId: (_runId: number | null) => void;
}

const RunRow = ({
  elementIndex,
  locateActivity,
  run,
  runIndex,
  setRunIndex,
  selectedRunId,
  setSelectedRunId,
}: IRunRowProperties) => {
  const distance = (run.distance / 1000.0).toFixed(2);
  const paceParts = run.average_speed ? formatPace(run.average_speed, run.type) : null;
  const heartRate = run.average_heartrate;
  const runTime = formatRunTime(run.moving_time);
  const handleClick = () => {
    if (selectedRunId === run.run_id) {
      // 如果点击的是已选中的行，取消选择
      setSelectedRunId(null);
      setRunIndex(-1);
      locateActivity([]);
      return;
    }
    // 选择新的行
    setSelectedRunId(run.run_id);
    setRunIndex(elementIndex);
    locateActivity([run.run_id]);
  };

  return (
    <tr
      className={`${styles.runRow} ${selectedRunId === run.run_id ? styles.selected : ''}`}
      key={run.start_date_local}
      onClick={handleClick}
    >
      <td>
        <div
          className="activity-type-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span
            className="activity-type-badge"
            style={{
              display: 'inline-block',
              padding: '0.25rem 0.75rem',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: '700',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-display, "Orbitron", sans-serif)',
              background: 'linear-gradient(135deg, var(--color-glow, #00ff88) 0%, rgba(0, 255, 136, 0.8) 100%)',
              color: 'var(--color-bg, #0a0a0a)',
              textShadow: 'none',
              boxShadow: '0 0 10px rgba(0, 255, 136, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(0, 255, 136, 0.6)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <span style={{ position: 'relative', zIndex: 2 }}>
              {titleForRun(run)}
            </span>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '-100%',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)',
                animation: 'shimmer 2s infinite',
                pointerEvents: 'none'
              }}
            />
          </span>
        </div>
      </td>
      <td>
        <div className="data-display-container">
          <span
            className="data-value"
            style={{
              fontFamily: 'var(--font-display, "Orbitron", sans-serif)',
              fontSize: '1rem',
              fontWeight: '600',
              color: 'var(--color-glow, #00ff88)',
              textShadow: '0 0 8px var(--color-glow, #00ff88)',
              letterSpacing: '0.05em'
            }}
          >
            {distance}
          </span>
          <span
            className="data-unit"
            style={{
              fontSize: '0.75rem',
              fontWeight: '400',
              color: 'rgba(232, 232, 232, 0.7)',
              marginLeft: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}
          >
            KM
          </span>
        </div>
      </td>
      {SHOW_ELEVATION_GAIN && (
        <td>
          <div className="data-display-container">
            <span
              className="data-value"
              style={{
                fontFamily: 'var(--font-display, "Orbitron", sans-serif)',
                fontSize: '1rem',
                fontWeight: '600',
                color: 'var(--color-glow, #00ff88)',
                textShadow: '0 0 8px var(--color-glow, #00ff88)',
                letterSpacing: '0.05em'
              }}
            >
              {(run.elevation_gain ?? 0.0).toFixed(1)}
            </span>
            <span
              className="data-unit"
              style={{
                fontSize: '0.75rem',
                fontWeight: '400',
                color: 'rgba(232, 232, 232, 0.7)',
                marginLeft: '0.25rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}
            >
              M
            </span>
          </div>
        </td>
      )}
      {paceParts && (
        <td style={{ whiteSpace: 'nowrap' }}>
          <div className="pace-display-container">
            <span
              className="pace-value"
              style={{
                fontFamily: 'var(--font-display, "Orbitron", sans-serif)',
                fontSize: '1rem',
                fontWeight: '600',
                color: 'var(--color-glow, #00ff88)',
                textShadow: '0 0 8px var(--color-glow, #00ff88)',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap'
              }}
            >
              {paceParts}
            </span>
          </div>
        </td>
      )}
      <td>
        {heartRate && (
          <div className="heartrate-display-container">
            <span
              className="heartrate-value"
              style={{
                fontFamily: 'var(--font-display, "Orbitron", sans-serif)',
                fontSize: '1rem',
                fontWeight: '600',
                color: 'var(--color-electric-blue, #00d4ff)',
                textShadow: '0 0 8px var(--color-electric-blue, #00d4ff)',
                letterSpacing: '0.05em'
              }}
            >
              {heartRate.toFixed(0)}
            </span>
            <span
              className="heartrate-unit"
              style={{
                fontSize: '0.75rem',
                fontWeight: '400',
                color: 'rgba(0, 212, 255, 0.7)',
                marginLeft: '0.25rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}
            >
              BPM
            </span>
          </div>
        )}
      </td>
      <td>
        <div className="time-display-container">
          <span
            className="time-value"
            style={{
              fontFamily: 'var(--font-display, "Orbitron", sans-serif)',
              fontSize: '1rem',
              fontWeight: '600',
              color: 'var(--color-glow, #00ff88)',
              textShadow: '0 0 8px var(--color-glow, #00ff88)',
              letterSpacing: '0.05em'
            }}
          >
            {runTime}
          </span>
        </div>
      </td>
      <td className={styles.runDate}>
        <div className="date-display-container">
          <span
            className="date-value"
            style={{
              fontFamily: 'var(--font-display, "Orbitron", sans-serif)',
              fontSize: '0.9rem',
              fontWeight: '500',
              color: 'rgba(232, 232, 232, 0.9)',
              letterSpacing: '0.02em'
            }}
          >
            {run.start_date_local.slice(0, 10)}
          </span>
        </div>
      </td>
    </tr>
  );
};

export default RunRow;
