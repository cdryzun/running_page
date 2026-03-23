import { lazy, Suspense } from 'react';
import Stat from '@/components/Stat';
import useActivities from '@/hooks/useActivities';
import useHover from '@/hooks/useHover';
import { yearStats, githubYearStats } from '@assets/index';
import { loadSvgComponent } from '@/utils/svgUtils';
import {
  IS_CHINESE,
  SHOW_ELEVATION_GAIN,
  type SportTypeFilter,
} from '@/utils/const';
import {
  formatAveragePrimaryMetric,
  formatPaceMetric,
  formatSpeedMetric,
  getAveragePrimaryMetricLabel,
  isPacePrimaryForSportType,
} from '@/utils/sportMetrics';
import {
  DIST_UNIT,
  M_TO_DIST,
  M_TO_ELEV,
  filterSportRuns,
} from '@/utils/utils';

const YearStat = ({
  year,
  onClick,
  sportType = 'all',
}: {
  year: string;
  onClick: (_year: string) => void;
  sportType?: SportTypeFilter;
}) => {
  let { activities: runs, years } = useActivities();
  // for hover
  const [hovered, eventHandlers] = useHover();
  // lazy Component
  const YearSVG = lazy(() => loadSvgComponent(yearStats, `./year_${year}.svg`));
  const GithubYearSVG = lazy(() =>
    loadSvgComponent(githubYearStats, `./github_${year}.svg`)
  );

  if (years.includes(year)) {
    runs = runs.filter((run) => run.start_date_local.slice(0, 4) === year);
  }
  if (sportType !== 'all') {
    runs = runs.filter((run) => filterSportRuns(run, sportType));
  }
  let sumDistance = 0;
  let streak = 0;
  let sumElevationGain = 0;
  let sumElevationLoss = 0;
  let elevationLossCount = 0;
  let heartRate = 0;
  let heartRateNullCount = 0;
  let power = 0;
  let powerCount = 0;
  let weightedPower = 0;
  let weightedPowerCount = 0;
  let cadence = 0;
  let cadenceCount = 0;
  let totalMetersAvail = 0;
  let totalSecondsAvail = 0;
  runs.forEach((run) => {
    sumDistance += run.distance || 0;
    sumElevationGain += run.elevation_gain || 0;
    if (run.elevation_loss !== null && run.elevation_loss !== undefined) {
      sumElevationLoss += run.elevation_loss;
      elevationLossCount++;
    }
    if (run.average_speed) {
      totalMetersAvail += run.distance || 0;
      totalSecondsAvail += (run.distance || 0) / run.average_speed;
    }
    if (run.average_heartrate) {
      heartRate += run.average_heartrate;
    } else {
      heartRateNullCount++;
    }
    if (run.average_watts && run.average_watts > 0) {
      power += run.average_watts;
      powerCount++;
    }
    if (run.weighted_average_watts && run.weighted_average_watts > 0) {
      weightedPower += run.weighted_average_watts;
      weightedPowerCount++;
    }
    if (run.average_cadence && run.average_cadence > 0) {
      cadence += run.average_cadence;
      cadenceCount++;
    }
    if (run.streak) {
      streak = Math.max(streak, run.streak);
    }
  });
  sumDistance = parseFloat((sumDistance / M_TO_DIST).toFixed(1));
  const sumElevationGainStr = (sumElevationGain * M_TO_ELEV).toFixed(0);
  const sumElevationLossStr = (sumElevationLoss * M_TO_ELEV).toFixed(0);
  const averageSpeed =
    totalMetersAvail > 0 && totalSecondsAvail > 0
      ? totalMetersAvail / totalSecondsAvail
      : 0;
  const avgPrimaryMetric = formatAveragePrimaryMetric(averageSpeed, sportType);
  const avgPrimaryMetricLabel = getAveragePrimaryMetricLabel(sportType);
  const pacePrimary = isPacePrimaryForSportType(sportType);
  const avgSecondaryMetricLabel = pacePrimary
    ? IS_CHINESE
      ? '平均速度'
      : 'Avg Speed'
    : IS_CHINESE
      ? '平均配速'
      : 'Avg Pace';
  const avgSecondaryMetricValue = pacePrimary
    ? formatSpeedMetric(averageSpeed)
    : formatPaceMetric(averageSpeed);
  const showSecondaryMetric = averageSpeed > 0;
  const hasHeartRate = !(heartRate === 0);
  const avgHeartRate = (heartRate / (runs.length - heartRateNullCount)).toFixed(
    0
  );
  const hasPower = powerCount > 0;
  const avgPower = hasPower ? (power / powerCount).toFixed(0) : '0';
  const hasWeightedPower = weightedPowerCount > 0;
  const avgWeightedPower = hasWeightedPower
    ? (weightedPower / weightedPowerCount).toFixed(0)
    : '0';
  const hasCadence = cadenceCount > 0;
  const avgCadence = hasCadence ? (cadence / cadenceCount).toFixed(0) : '0';
  return (
    <div className="cursor-pointer" onClick={() => onClick(year)}>
      <section {...eventHandlers}>
        <Stat value={year} description=" Journey" />
        <Stat value={runs.length} description=" Activities" />
        <Stat value={sumDistance} description={` ${DIST_UNIT}`} />
        {SHOW_ELEVATION_GAIN && (
          <Stat value={sumElevationGainStr} description=" Elevation Gain" />
        )}
        {SHOW_ELEVATION_GAIN && elevationLossCount > 0 && (
          <Stat
            value={sumElevationLossStr}
            description={IS_CHINESE ? ' 海拔下降' : ' Elevation Loss'}
          />
        )}
        <Stat
          value={avgPrimaryMetric}
          description={` ${avgPrimaryMetricLabel}`}
        />
        {showSecondaryMetric && (
          <Stat
            value={avgSecondaryMetricValue}
            description={` ${avgSecondaryMetricLabel}`}
          />
        )}
        <Stat value={`${streak} day`} description=" Streak" />
        {hasHeartRate && (
          <Stat value={avgHeartRate} description=" Avg Heart Rate" />
        )}
        {hasPower && (
          <Stat
            value={avgPower}
            description={IS_CHINESE ? ' 平均功率' : ' Avg Power'}
          />
        )}
        {hasWeightedPower && (
          <Stat
            value={avgWeightedPower}
            description={IS_CHINESE ? ' 加权功率' : ' Weighted Power'}
          />
        )}
        {hasCadence && (
          <Stat
            value={avgCadence}
            description={IS_CHINESE ? ' 平均踏频' : ' Avg Cadence'}
          />
        )}
      </section>
      {year !== 'Total' && hovered && (
        <Suspense fallback="loading...">
          <YearSVG className="year-svg my-4 h-4/6 w-4/6 border-0 p-0" />
          <GithubYearSVG className="github-year-svg my-4 h-auto w-full border-0 p-0" />
        </Suspense>
      )}
      <hr />
    </div>
  );
};

export default YearStat;
