import React, {
  lazy,
  useState,
  Suspense,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import VirtualList from 'rc-virtual-list';
import { useNavigate } from 'react-router-dom';
import activities from '@/static/activities.json';
import styles from './style.module.css';
import {
  ACTIVITY_TOTAL,
  HOME_PAGE_TITLE,
  IS_CHINESE,
  LOADING_TEXT,
  SHOW_ELEVATION_GAIN,
  SPORT_TYPE_OPTIONS,
  type SportTypeFilter,
} from '@/utils/const';
import { totalStat, yearSummaryStats } from '@assets/index';
import { loadSvgComponent } from '@/utils/svgUtils';
import {
  Activity,
  DIST_UNIT,
  M_TO_DIST,
  convertMovingTime2Sec,
  filterSportRuns,
  normalizeActivityType,
} from '@/utils/utils';
import {
  formatAveragePrimaryMetric,
  formatPaceMetric,
  formatSpeedMetric,
  getAveragePrimaryMetricLabel,
  isPacePrimaryForSportType,
} from '@/utils/sportMetrics';
import RoutePreview from '@/components/RoutePreview';
// Layout constants (avoid magic numbers)
const ITEM_WIDTH = 280;
const ITEM_GAP = 20;
const ALL_ACTIVITIES = activities as Activity[];

const VIRTUAL_LIST_STYLES = {
  horizontalScrollBar: {},
  horizontalScrollBarThumb: {
    background:
      'var(--color-primary, var(--color-scrollbar-thumb, rgba(0,0,0,0.4)))',
  },
  verticalScrollBar: {},
  verticalScrollBarThumb: {
    background:
      'var(--color-primary, var(--color-scrollbar-thumb, rgba(0,0,0,0.4)))',
  },
};
const MonthOfLifeSvg = (sportType: string) => {
  const path = sportType === 'all' ? './mol.svg' : `./mol_${sportType}.svg`;
  return lazy(() => loadSvgComponent(totalStat, path));
};

const RunningSvg = MonthOfLifeSvg('running');
const WalkingSvg = MonthOfLifeSvg('walking');
const HikingSvg = MonthOfLifeSvg('hiking');
const CyclingSvg = MonthOfLifeSvg('cycling');
const SwimmingSvg = MonthOfLifeSvg('swimming');
const SkiingSvg = MonthOfLifeSvg('skiing');
const AllSvg = MonthOfLifeSvg('all');

// Cache for year summary lazy components to prevent flickering
const yearSummaryCache: Record<
  string,
  React.LazyExoticComponent<React.FC<React.SVGProps<SVGSVGElement>>>
> = {};
const getYearSummarySvg = (year: string) => {
  if (!yearSummaryCache[year]) {
    yearSummaryCache[year] = lazy(() =>
      loadSvgComponent(yearSummaryStats, `./year_summary_${year}.svg`)
    );
  }
  return yearSummaryCache[year];
};

interface ActivitySummary {
  totalDistance: number;
  totalTime: number;
  totalElevationGain: number;
  totalElevationLoss: number;
  count: number;
  dailyDistances: number[];
  maxDistance: number;
  maxSpeed: number;
  location: string;
  totalHeartRate: number; // Add heart rate statistics
  heartRateCount: number;
  maxDuration: number;
  maxElevationGain: number;
  elevationGainCount: number;
  elevationLossCount: number;
  totalPower: number;
  powerCount: number;
  weightedPowerTotal: number;
  weightedPowerCount: number;
  maxPower: number;
  totalCadence: number;
  cadenceCount: number;
  maxCadence: number;
  activities: Activity[]; // Add activities array for day interval
}

interface DisplaySummary {
  totalDistance: number;
  averageSpeed: number;
  totalTime: number;
  count: number;
  maxDistance: number;
  maxSpeed: number;
  location: string;
  averageDuration: number;
  maxDuration: number;
  totalElevationGain?: number;
  totalElevationLoss?: number;
  averageHeartRate?: number; // Add heart rate display
  maxElevationGain?: number;
  climbRate?: number;
  elevationPerDistance?: number;
  averagePower?: number;
  weightedAveragePower?: number;
  maxPower?: number;
  averageCadence?: number;
  maxCadence?: number;
}

interface ChartData {
  day: number;
  distance: string;
}

interface ActivityCardProps {
  period: string;
  summary: DisplaySummary;
  dailyDistances: number[];
  interval: IntervalType;
  sportType: SportTypeFilter;
  activities?: Activity[]; // Add activities for day interval
}

interface ActivityGroups {
  [key: string]: ActivitySummary;
}

type IntervalType = 'year' | 'month' | 'week' | 'day' | 'life';

// A row group contains multiple activity card data items that will be rendered in one virtualized row
type RowGroup = Array<{ period: string; summary: ActivitySummary }>;

const METRIC_LABELS = {
  avgPace: IS_CHINESE ? '平均配速' : 'Average Pace',
  avgSpeed: ACTIVITY_TOTAL.AVERAGE_SPEED_TITLE,
  bestPace: IS_CHINESE ? '最佳配速' : 'Best Pace',
  avgDuration: IS_CHINESE ? '平均时长' : 'Avg Duration',
  maxDuration: IS_CHINESE ? '最长时长' : 'Longest Duration',
  maxElevation: IS_CHINESE ? '单次最大爬升' : 'Max Elevation',
  totalElevationLoss: IS_CHINESE ? '总海拔下降' : 'Total Descent',
  climbRate: IS_CHINESE ? '爬升速率' : 'Climb Rate',
  elevationPerDistance: IS_CHINESE
    ? `每${DIST_UNIT}爬升`
    : `Elevation per ${DIST_UNIT}`,
  avgPower: IS_CHINESE ? '平均功率' : 'Avg Power',
  weightedPower: IS_CHINESE ? '加权功率' : 'Weighted Power',
  maxPower: IS_CHINESE ? '最大功率' : 'Max Power',
  avgCadence: IS_CHINESE ? '平均踏频' : 'Avg Cadence',
  maxCadence: IS_CHINESE ? '最大踏频' : 'Max Cadence',
};

const speedDistPerHourToMps = (speed: number): number =>
  (speed * M_TO_DIST) / 3600;

const ActivityCardInner: React.FC<ActivityCardProps> = ({
  period,
  summary,
  dailyDistances,
  interval,
  sportType,
  activities = [],
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const handleCardClick = () => {
    if (interval === 'day' && activities.length > 0) {
      setIsFlipped(!isFlipped);
    }
  };
  const generateLabels = (): number[] => {
    if (interval === 'month') {
      const [year, month] = period.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate(); // Get the number of days in the month
      return Array.from({ length: daysInMonth }, (_, i) => i + 1);
    } else if (interval === 'week') {
      return Array.from({ length: 7 }, (_, i) => i + 1);
    } else if (interval === 'year') {
      return Array.from({ length: 12 }, (_, i) => i + 1); // Generate months 1 to 12
    }
    return [];
  };

  const data: ChartData[] = generateLabels().map((day) => ({
    day,
    distance: (dailyDistances[day - 1] || 0).toFixed(2), // Keep two decimal places
  }));

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const avgSpeedMps = speedDistPerHourToMps(summary.averageSpeed);
  const maxSpeedMps = speedDistPerHourToMps(summary.maxSpeed);
  const avgPrimaryMetricLabel = getAveragePrimaryMetricLabel(sportType);
  const avgPrimaryMetricValue = formatAveragePrimaryMetric(
    avgSpeedMps,
    sportType
  );
  const pacePrimary = isPacePrimaryForSportType(sportType);
  const secondaryMetric =
    summary.averageSpeed > 0
      ? pacePrimary
        ? {
            label: METRIC_LABELS.avgSpeed,
            value: formatSpeedMetric(avgSpeedMps),
          }
        : {
            label: METRIC_LABELS.avgPace,
            value: formatPaceMetric(avgSpeedMps),
          }
      : null;

  const bestMetric =
    summary.maxSpeed > 0
      ? pacePrimary
        ? {
            label: METRIC_LABELS.bestPace,
            value: formatPaceMetric(maxSpeedMps),
          }
        : {
            label: ACTIVITY_TOTAL.MAX_SPEED_TITLE,
            value: formatSpeedMetric(maxSpeedMps),
          }
      : null;

  // Calculate Y-axis maximum value and ticks
  const yAxisMax = Math.ceil(
    Math.max(...data.map((d) => parseFloat(d.distance))) + 10
  ); // Round up and add buffer
  const yAxisTicks = Array.from(
    { length: Math.ceil(yAxisMax / 5) + 1 },
    (_, i) => i * 5
  ); // Generate arithmetic sequence

  return (
    <div
      className={`${styles.activityCard} ${interval === 'day' ? styles.activityCardFlippable : ''}`}
      onClick={handleCardClick}
      style={{
        cursor:
          interval === 'day' && activities.length > 0 ? 'pointer' : 'default',
      }}
    >
      <div className={`${styles.cardInner} ${isFlipped ? styles.flipped : ''}`}>
        {/* Front side - Activity details */}
        <div className={styles.cardFront}>
          <h2 className={styles.activityName}>{period}</h2>
          <div className={styles.activityDetails}>
            <p>
              <strong>{ACTIVITY_TOTAL.TOTAL_DISTANCE_TITLE}:</strong>{' '}
              {summary.totalDistance.toFixed(2)} {DIST_UNIT}
            </p>
            {SHOW_ELEVATION_GAIN &&
              summary.totalElevationGain !== undefined && (
                <p>
                  <strong>{ACTIVITY_TOTAL.TOTAL_ELEVATION_GAIN_TITLE}:</strong>{' '}
                  {summary.totalElevationGain.toFixed(0)} m
                </p>
              )}
            {SHOW_ELEVATION_GAIN &&
              summary.totalElevationLoss !== undefined && (
                <p>
                  <strong>{METRIC_LABELS.totalElevationLoss}:</strong>{' '}
                  {summary.totalElevationLoss.toFixed(0)} m
                </p>
              )}
            <p>
              <strong>{avgPrimaryMetricLabel}:</strong> {avgPrimaryMetricValue}
            </p>
            {secondaryMetric && (
              <p>
                <strong>{secondaryMetric.label}:</strong>{' '}
                {secondaryMetric.value}
              </p>
            )}
            <p>
              <strong>{ACTIVITY_TOTAL.TOTAL_TIME_TITLE}:</strong>{' '}
              {formatTime(summary.totalTime)}
            </p>
            <p>
              <strong>{METRIC_LABELS.avgDuration}:</strong>{' '}
              {formatTime(summary.averageDuration)}
            </p>
            {summary.averageHeartRate !== undefined && (
              <p>
                <strong>{ACTIVITY_TOTAL.AVERAGE_HEART_RATE_TITLE}:</strong>{' '}
                {summary.averageHeartRate.toFixed(0)} bpm
              </p>
            )}
            {summary.averagePower !== undefined && (
              <p>
                <strong>{METRIC_LABELS.avgPower}:</strong>{' '}
                {summary.averagePower.toFixed(0)} W
              </p>
            )}
            {summary.weightedAveragePower !== undefined && (
              <p>
                <strong>{METRIC_LABELS.weightedPower}:</strong>{' '}
                {summary.weightedAveragePower.toFixed(0)} W
              </p>
            )}
            {summary.averageCadence !== undefined && (
              <p>
                <strong>{METRIC_LABELS.avgCadence}:</strong>{' '}
                {summary.averageCadence.toFixed(0)} rpm
              </p>
            )}
            {SHOW_ELEVATION_GAIN &&
              summary.maxElevationGain !== undefined &&
              summary.maxElevationGain > 0 && (
                <p>
                  <strong>{METRIC_LABELS.maxElevation}:</strong>{' '}
                  {summary.maxElevationGain.toFixed(0)} m
                </p>
              )}
            {SHOW_ELEVATION_GAIN &&
              summary.elevationPerDistance !== undefined &&
              summary.elevationPerDistance > 0 && (
                <p>
                  <strong>{METRIC_LABELS.elevationPerDistance}:</strong>{' '}
                  {summary.elevationPerDistance.toFixed(1)} m/{DIST_UNIT}
                </p>
              )}
            {SHOW_ELEVATION_GAIN &&
              summary.climbRate !== undefined &&
              summary.climbRate > 0 && (
                <p>
                  <strong>{METRIC_LABELS.climbRate}:</strong>{' '}
                  {summary.climbRate.toFixed(0)} m/h
                </p>
              )}
            {interval !== 'day' && (
              <>
                <p>
                  <strong>{ACTIVITY_TOTAL.ACTIVITY_COUNT_TITLE}:</strong>{' '}
                  {summary.count}
                </p>
                <p>
                  <strong>{ACTIVITY_TOTAL.MAX_DISTANCE_TITLE}:</strong>{' '}
                  {summary.maxDistance.toFixed(2)} {DIST_UNIT}
                </p>
                <p>
                  <strong>{METRIC_LABELS.maxDuration}:</strong>{' '}
                  {formatTime(summary.maxDuration)}
                </p>
                {bestMetric && (
                  <p>
                    <strong>{bestMetric.label}:</strong> {bestMetric.value}
                  </p>
                )}
                {summary.maxPower !== undefined && (
                  <p>
                    <strong>{METRIC_LABELS.maxPower}:</strong>{' '}
                    {summary.maxPower.toFixed(0)} W
                  </p>
                )}
                {summary.maxCadence !== undefined && (
                  <p>
                    <strong>{METRIC_LABELS.maxCadence}:</strong>{' '}
                    {summary.maxCadence.toFixed(0)} rpm
                  </p>
                )}
                <p>
                  <strong>{ACTIVITY_TOTAL.AVERAGE_DISTANCE_TITLE}:</strong>{' '}
                  {(summary.totalDistance / summary.count).toFixed(2)}{' '}
                  {DIST_UNIT}
                </p>
              </>
            )}
            {['month', 'week', 'year'].includes(interval) && (
              <div className={styles.chart}>
                <ResponsiveContainer>
                  <BarChart
                    data={data}
                    margin={{ top: 20, right: 20, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-run-row-hover-background)"
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: 'var(--color-run-table-thead)' }}
                    />
                    <YAxis
                      label={{
                        value: DIST_UNIT,
                        angle: -90,
                        position: 'insideLeft',
                        fill: 'var(--color-run-table-thead)',
                      }}
                      domain={[0, yAxisMax]}
                      ticks={yAxisTicks}
                      tick={{ fill: 'var(--color-run-table-thead)' }}
                    />
                    <Tooltip
                      formatter={(value) => `${value} ${DIST_UNIT}`}
                      contentStyle={{
                        backgroundColor:
                          'var(--color-run-row-hover-background)',
                        border:
                          '1px solid var(--color-run-row-hover-background)',
                        color: 'var(--color-run-table-thead)',
                      }}
                      labelStyle={{ color: 'var(--color-primary)' }}
                    />
                    <Bar dataKey="distance" fill="var(--color-primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Back side - Route preview */}
        {interval === 'day' && activities.length > 0 && (
          <div className={styles.cardBack}>
            <div className={styles.routeContainer}>
              <RoutePreview activities={activities} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// custom equality for memo: compare key summary fields, dailyDistances values and activities length
const activityCardAreEqual = (
  prev: ActivityCardProps,
  next: ActivityCardProps
) => {
  if (prev.period !== next.period) return false;
  if (prev.interval !== next.interval) return false;
  if (prev.sportType !== next.sportType) return false;
  const s1 = prev.summary;
  const s2 = next.summary;
  if (
    s1.totalDistance !== s2.totalDistance ||
    s1.averageSpeed !== s2.averageSpeed ||
    s1.totalTime !== s2.totalTime ||
    s1.count !== s2.count ||
    s1.maxDistance !== s2.maxDistance ||
    s1.maxSpeed !== s2.maxSpeed ||
    s1.location !== s2.location ||
    s1.averageDuration !== s2.averageDuration ||
    s1.maxDuration !== s2.maxDuration ||
    (s1.totalElevationGain ?? undefined) !==
      (s2.totalElevationGain ?? undefined) ||
    (s1.totalElevationLoss ?? undefined) !==
      (s2.totalElevationLoss ?? undefined) ||
    (s1.averageHeartRate ?? undefined) !== (s2.averageHeartRate ?? undefined) ||
    (s1.maxElevationGain ?? undefined) !== (s2.maxElevationGain ?? undefined) ||
    (s1.climbRate ?? undefined) !== (s2.climbRate ?? undefined) ||
    (s1.elevationPerDistance ?? undefined) !==
      (s2.elevationPerDistance ?? undefined) ||
    (s1.averagePower ?? undefined) !== (s2.averagePower ?? undefined) ||
    (s1.weightedAveragePower ?? undefined) !==
      (s2.weightedAveragePower ?? undefined) ||
    (s1.maxPower ?? undefined) !== (s2.maxPower ?? undefined) ||
    (s1.averageCadence ?? undefined) !== (s2.averageCadence ?? undefined) ||
    (s1.maxCadence ?? undefined) !== (s2.maxCadence ?? undefined)
  ) {
    return false;
  }
  const d1 = prev.dailyDistances || [];
  const d2 = next.dailyDistances || [];
  if (d1.length !== d2.length) return false;
  for (let i = 0; i < d1.length; i++) if (d1[i] !== d2[i]) return false;
  const a1 = prev.activities || [];
  const a2 = next.activities || [];
  if (a1.length !== a2.length) return false;
  return true;
};

const ActivityCard = React.memo(ActivityCardInner, activityCardAreEqual);

const ActivityList: React.FC = () => {
  const [interval, setInterval] = useState<IntervalType>('month');
  const [sportType, setSportType] = useState<SportTypeFilter>('all');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  // Get available years from activities
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    ALL_ACTIVITIES.forEach((activity) => {
      const year = new Date(activity.start_date_local).getFullYear().toString();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, []);

  const sportTypeOptions = useMemo(() => {
    const availableTypes = new Set(
      ALL_ACTIVITIES.map((activity) => normalizeActivityType(activity.type))
    );
    return SPORT_TYPE_OPTIONS.filter(
      (option) => option.value === 'all' || availableTypes.has(option.value)
    );
  }, []);

  // Keyboard navigation for year selection in Life view
  useEffect(() => {
    if (interval !== 'life') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow keys
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      // Prevent default scrolling behavior
      e.preventDefault();

      // Remove focus from current element to avoid visual confusion
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const currentIndex = selectedYear
        ? availableYears.indexOf(selectedYear)
        : -1;

      if (e.key === 'ArrowLeft') {
        // Move to newer year (left in UI, lower index since sorted descending)
        if (currentIndex === -1) {
          // No year selected, select the last (oldest) year
          setSelectedYear(availableYears[availableYears.length - 1]);
        } else if (currentIndex > 0) {
          setSelectedYear(availableYears[currentIndex - 1]);
        } else if (currentIndex === 0) {
          // At the most recent year, deselect to show Life view
          setSelectedYear(null);
        }
      } else if (e.key === 'ArrowRight') {
        // Move to older year (right in UI, higher index since sorted descending)
        if (currentIndex === -1) {
          // No year selected, select the first (most recent) year
          setSelectedYear(availableYears[0]);
        } else if (currentIndex < availableYears.length - 1) {
          setSelectedYear(availableYears[currentIndex + 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [interval, selectedYear, availableYears]);

  // 添加useEffect监听interval变化
  useEffect(() => {
    if (interval === 'life' && sportType !== 'all') {
      setSportType('all');
    }
  }, [interval, sportType]);

  const navigate = useNavigate();

  const handleHomeClick = () => {
    navigate('/');
  };

  function toggleInterval(newInterval: IntervalType): void {
    setInterval(newInterval);
  }

  function groupActivitiesFn(
    intervalArg: IntervalType,
    sportTypeArg: SportTypeFilter
  ): ActivityGroups {
    return ALL_ACTIVITIES.filter((activity) =>
      filterSportRuns(activity, sportTypeArg)
    ).reduce((acc: ActivityGroups, activity) => {
      const date = new Date(activity.start_date_local);
      let key: string;
      let index: number;
      switch (intervalArg) {
        case 'year':
          key = date.getFullYear().toString();
          index = date.getMonth();
          break;
        case 'month':
          key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          index = date.getDate() - 1;
          break;
        case 'week': {
          const currentDate = new Date(date.valueOf());
          currentDate.setDate(
            currentDate.getDate() + 4 - (currentDate.getDay() || 7)
          );
          const yearStart = new Date(currentDate.getFullYear(), 0, 1);
          const weekNum = Math.ceil(
            ((currentDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
          );
          key = `${currentDate.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
          index = (date.getDay() + 6) % 7;
          break;
        }
        case 'day':
          key = date.toLocaleDateString('zh').replaceAll('/', '-');
          index = 0;
          break;
        default:
          key = date.getFullYear().toString();
          index = 0;
      }

      if (!acc[key])
        acc[key] = {
          totalDistance: 0,
          totalTime: 0,
          totalElevationGain: 0,
          totalElevationLoss: 0,
          count: 0,
          dailyDistances: [],
          maxDistance: 0,
          maxSpeed: 0,
          location: '',
          totalHeartRate: 0,
          heartRateCount: 0,
          maxDuration: 0,
          maxElevationGain: 0,
          elevationGainCount: 0,
          elevationLossCount: 0,
          totalPower: 0,
          powerCount: 0,
          weightedPowerTotal: 0,
          weightedPowerCount: 0,
          maxPower: 0,
          totalCadence: 0,
          cadenceCount: 0,
          maxCadence: 0,
          activities: [],
        };

      const distance = activity.distance / M_TO_DIST;
      const timeInSeconds = convertMovingTime2Sec(activity.moving_time);
      const speed = timeInSeconds > 0 ? distance / (timeInSeconds / 3600) : 0;

      acc[key].totalDistance += distance;
      acc[key].totalTime += timeInSeconds;
      if (timeInSeconds > acc[key].maxDuration) {
        acc[key].maxDuration = timeInSeconds;
      }

      if (
        SHOW_ELEVATION_GAIN &&
        activity.elevation_gain !== null &&
        activity.elevation_gain !== undefined
      ) {
        acc[key].totalElevationGain += activity.elevation_gain;
        acc[key].elevationGainCount += 1;
        if (activity.elevation_gain > acc[key].maxElevationGain) {
          acc[key].maxElevationGain = activity.elevation_gain;
        }
      }
      if (
        SHOW_ELEVATION_GAIN &&
        activity.elevation_loss !== null &&
        activity.elevation_loss !== undefined
      ) {
        acc[key].totalElevationLoss += activity.elevation_loss;
        acc[key].elevationLossCount += 1;
      }

      if (activity.average_heartrate) {
        acc[key].totalHeartRate += activity.average_heartrate;
        acc[key].heartRateCount += 1;
      }
      if (
        activity.average_watts !== null &&
        activity.average_watts !== undefined &&
        activity.average_watts > 0
      ) {
        acc[key].totalPower += activity.average_watts;
        acc[key].powerCount += 1;
      }
      if (
        activity.weighted_average_watts !== null &&
        activity.weighted_average_watts !== undefined &&
        activity.weighted_average_watts > 0
      ) {
        acc[key].weightedPowerTotal += activity.weighted_average_watts;
        acc[key].weightedPowerCount += 1;
      }
      if (
        activity.max_watts !== null &&
        activity.max_watts !== undefined &&
        activity.max_watts > acc[key].maxPower
      ) {
        acc[key].maxPower = activity.max_watts;
      }
      if (
        activity.average_cadence !== null &&
        activity.average_cadence !== undefined &&
        activity.average_cadence > 0
      ) {
        acc[key].totalCadence += activity.average_cadence;
        acc[key].cadenceCount += 1;
      }
      if (
        activity.max_cadence !== null &&
        activity.max_cadence !== undefined &&
        activity.max_cadence > acc[key].maxCadence
      ) {
        acc[key].maxCadence = activity.max_cadence;
      }

      acc[key].count += 1;
      if (intervalArg === 'day') acc[key].activities.push(activity);
      acc[key].dailyDistances[index] =
        (acc[key].dailyDistances[index] || 0) + distance;
      if (distance > acc[key].maxDistance) acc[key].maxDistance = distance;
      if (speed > acc[key].maxSpeed) acc[key].maxSpeed = speed;
      if (intervalArg === 'day')
        acc[key].location = activity.location_country || '';

      return acc;
    }, {} as ActivityGroups);
  }

  const toDisplaySummary = (summary: ActivitySummary): DisplaySummary => {
    const averageSpeed = summary.totalTime
      ? summary.totalDistance / (summary.totalTime / 3600)
      : 0;
    return {
      totalDistance: summary.totalDistance,
      averageSpeed,
      totalTime: summary.totalTime,
      count: summary.count,
      maxDistance: summary.maxDistance,
      maxSpeed: summary.maxSpeed,
      location: summary.location,
      averageDuration: summary.count ? summary.totalTime / summary.count : 0,
      maxDuration: summary.maxDuration,
      totalElevationGain: SHOW_ELEVATION_GAIN
        ? summary.totalElevationGain
        : undefined,
      totalElevationLoss:
        SHOW_ELEVATION_GAIN && summary.elevationLossCount > 0
          ? summary.totalElevationLoss
          : undefined,
      maxElevationGain:
        SHOW_ELEVATION_GAIN && summary.elevationGainCount > 0
          ? summary.maxElevationGain
          : undefined,
      climbRate:
        SHOW_ELEVATION_GAIN && summary.totalTime > 0
          ? summary.totalElevationGain / (summary.totalTime / 3600)
          : undefined,
      elevationPerDistance:
        SHOW_ELEVATION_GAIN && summary.totalDistance > 0
          ? summary.totalElevationGain / summary.totalDistance
          : undefined,
      averageHeartRate:
        summary.heartRateCount > 0
          ? summary.totalHeartRate / summary.heartRateCount
          : undefined,
      averagePower:
        summary.powerCount > 0
          ? summary.totalPower / summary.powerCount
          : undefined,
      weightedAveragePower:
        summary.weightedPowerCount > 0
          ? summary.weightedPowerTotal / summary.weightedPowerCount
          : undefined,
      maxPower: summary.maxPower > 0 ? summary.maxPower : undefined,
      averageCadence:
        summary.cadenceCount > 0
          ? summary.totalCadence / summary.cadenceCount
          : undefined,
      maxCadence: summary.maxCadence > 0 ? summary.maxCadence : undefined,
    };
  };

  const activitiesByInterval = useMemo(
    () => groupActivitiesFn(interval, sportType),
    [interval, sportType]
  );

  const dataList = useMemo(
    () =>
      Object.entries(activitiesByInterval)
        .sort(([a], [b]) => {
          if (interval === 'day') {
            return new Date(b).getTime() - new Date(a).getTime(); // Sort by date
          } else if (interval === 'week') {
            const [yearA, weekA] = a.split('-W').map(Number);
            const [yearB, weekB] = b.split('-W').map(Number);
            return yearB - yearA || weekB - weekA; // Sort by year and week number
          } else {
            const [yearA, monthA = 0] = a.split('-').map(Number);
            const [yearB, monthB = 0] = b.split('-').map(Number);
            return yearB - yearA || monthB - monthA; // Sort by year and month
          }
        })
        .map(([period, summary]) => ({ period, summary })),
    [activitiesByInterval, interval]
  );

  const itemWidth = ITEM_WIDTH;
  const gap = ITEM_GAP;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const [itemsPerRow, setItemsPerRow] = useState(0);
  const [rowHeight, setRowHeight] = useState<number>(360);
  const sampleRef = useRef<HTMLDivElement | null>(null);
  const [listHeight, setListHeight] = useState<number>(500);

  // ref to the VirtualList DOM node so we can control scroll position
  const virtualListRef = useRef<HTMLDivElement | null>(null);

  const calculateItemsPerRow = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    // Calculate how many items can fit in one row (considering gaps)
    const count = Math.floor((containerWidth + gap) / (itemWidth + gap));
    setItemsPerRow(count);
  }, [gap, itemWidth]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Calculate immediately once
    calculateItemsPerRow();

    // Use ResizeObserver to monitor container size changes
    const resizeObserver = new ResizeObserver(calculateItemsPerRow);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [calculateItemsPerRow]);

  // when the interval changes, scroll the virtual list to top to improve UX
  useEffect(() => {
    // attempt to find the virtual list DOM node and reset scrollTop
    const resetScroll = () => {
      // prefer an explicit ref if available
      const el =
        virtualListRef.current || document.querySelector('.rc-virtual-list');
      if (el) {
        try {
          el.scrollTop = 0;
        } catch (e) {
          console.error(e);
        }
      }
    };

    // Defer to next frame so the list has time to re-render with new data
    const id = requestAnimationFrame(() => requestAnimationFrame(resetScroll));
    // also fallback to a short timeout
    const t = setTimeout(resetScroll, 50);

    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [interval, sportType]);

  // compute list height = viewport height - filter container height
  useEffect(() => {
    const updateListHeight = () => {
      const filterH = filterRef.current?.clientHeight || 0;
      const containerEl = containerRef.current;
      let topOffset = 0;
      if (containerEl) {
        const rect = containerEl.getBoundingClientRect();
        topOffset = Math.max(0, rect.top);
      }
      const base = topOffset || filterH || 0;
      // Try to compute a dynamic bottom padding by checking the container's parent element's bottom
      let bottomPadding = 16; // fallback
      if (containerEl && containerEl.parentElement) {
        try {
          const parentRect = containerEl.parentElement.getBoundingClientRect();
          const containerRect = containerEl.getBoundingClientRect();
          const distanceToParentBottom = Math.max(
            0,
            parentRect.bottom - containerRect.bottom
          );
          // Use a small fraction of that distance (or clamp) to avoid huge paddings
          bottomPadding = Math.min(
            48,
            Math.max(8, Math.round(distanceToParentBottom / 4))
          );
        } catch (e) {
          console.error(e);
        }
      }
      const h = Math.max(100, window.innerHeight - base - bottomPadding);
      setListHeight(h);
    };

    // initial
    updateListHeight();

    // window resize
    window.addEventListener('resize', updateListHeight);

    // observe filter size changes
    const ro = new ResizeObserver(updateListHeight);
    if (filterRef.current) ro.observe(filterRef.current);

    return () => {
      window.removeEventListener('resize', updateListHeight);
      ro.disconnect();
    };
  }, []);

  // measure representative card height using a hidden sample and ResizeObserver
  useEffect(() => {
    const el = sampleRef.current;
    if (!el) return;
    const update = () => {
      const h = el.offsetHeight;
      if (h && h !== rowHeight) setRowHeight(h);
    };
    // initial
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dataList, rowHeight]);

  const calcGroup: RowGroup[] = useMemo(() => {
    if (itemsPerRow < 1) return [];
    const groupLength = Math.ceil(dataList.length / itemsPerRow);
    const arr: RowGroup[] = [];
    for (let i = 0; i < groupLength; i++) {
      const start = i * itemsPerRow;
      arr.push(dataList.slice(start, start + itemsPerRow));
    }
    return arr;
  }, [dataList, itemsPerRow]);

  // compute a row width so we can center the VirtualList and keep cards left-aligned inside
  const rowWidth =
    itemsPerRow < 1
      ? '100%'
      : `${itemsPerRow * itemWidth + Math.max(0, itemsPerRow - 1) * gap}px`;

  const loading = itemsPerRow < 1 || !rowHeight;

  return (
    <div className={styles.activityList}>
      <div className={styles.filterContainer} ref={filterRef}>
        <button className={styles.smallHomeButton} onClick={handleHomeClick}>
          {HOME_PAGE_TITLE}
        </button>
        <select
          onChange={(e) => setSportType(e.target.value as SportTypeFilter)}
          value={sportType}
        >
          {sportTypeOptions.map((type) => (
            <option
              key={type.value}
              value={type.value}
              disabled={interval === 'life' && type.value !== 'all'}
            >
              {type.label}
            </option>
          ))}
        </select>
        <select
          onChange={(e) => toggleInterval(e.target.value as IntervalType)}
          value={interval}
        >
          <option value="year">{ACTIVITY_TOTAL.YEARLY_TITLE}</option>
          <option value="month">{ACTIVITY_TOTAL.MONTHLY_TITLE}</option>
          <option value="week">{ACTIVITY_TOTAL.WEEKLY_TITLE}</option>
          <option value="day">{ACTIVITY_TOTAL.DAILY_TITLE}</option>
          <option value="life">Life</option>
        </select>
      </div>

      {interval === 'life' && (
        <div className={styles.lifeContainer}>
          {/* Year selector buttons */}
          <div className={styles.yearSelector}>
            {availableYears.map((year) => (
              <button
                key={year}
                className={`${styles.yearButton} ${selectedYear === year ? styles.yearButtonActive : ''}`}
                onClick={() =>
                  setSelectedYear(selectedYear === year ? null : year)
                }
              >
                {year}
              </button>
            ))}
          </div>
          <Suspense fallback={<div>Loading SVG...</div>}>
            {selectedYear ? (
              // Show Year Summary SVG when a year is selected
              (() => {
                const YearSvg = getYearSummarySvg(selectedYear);
                return <YearSvg className={styles.yearSummarySvg} />;
              })()
            ) : (
              // Show Life SVG when no year is selected
              <>
                {sportType === 'running' && <RunningSvg />}
                {sportType === 'walking' && <WalkingSvg />}
                {sportType === 'hiking' && <HikingSvg />}
                {sportType === 'cycling' && <CyclingSvg />}
                {sportType === 'swimming' && <SwimmingSvg />}
                {sportType === 'skiing' && <SkiingSvg />}
                {sportType === 'all' && <AllSvg />}
              </>
            )}
          </Suspense>
        </div>
      )}

      {interval !== 'life' && (
        <div className={styles.summaryContainer} ref={containerRef}>
          {/* hidden sample card for measuring row height */}
          <div
            style={{
              position: 'absolute',
              visibility: 'hidden',
              pointerEvents: 'none',
              height: 'auto',
            }}
            ref={sampleRef}
          >
            {dataList[0] && (
              <ActivityCard
                key={dataList[0].period}
                period={dataList[0].period}
                summary={toDisplaySummary(dataList[0].summary)}
                dailyDistances={dataList[0].summary.dailyDistances}
                interval={interval}
                sportType={sportType}
                activities={
                  interval === 'day'
                    ? dataList[0].summary.activities
                    : undefined
                }
              />
            )}
          </div>
          <div className={styles.summaryInner}>
            <div style={{ width: rowWidth }}>
              {loading ? (
                // Use full viewport height (or viewport minus filter height if available) to avoid flicker
                <div
                  style={{
                    height: filterRef.current
                      ? `${Math.max(100, window.innerHeight - (filterRef.current.clientHeight || 0) - 40)}px`
                      : '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      padding: 20,
                      color: 'var(--color-run-table-thead)',
                    }}
                  >
                    {LOADING_TEXT}
                  </div>
                </div>
              ) : (
                <VirtualList
                  key={`${sportType}-${interval}-${itemsPerRow}`}
                  data={calcGroup}
                  height={listHeight}
                  itemHeight={rowHeight}
                  itemKey={(row: RowGroup) => row[0]?.period ?? ''}
                  styles={VIRTUAL_LIST_STYLES}
                >
                  {(row: RowGroup) => (
                    <div
                      ref={virtualListRef}
                      className={styles.rowContainer}
                      style={{ gap: `${gap}px` }}
                    >
                      {row.map(
                        (cardData: {
                          period: string;
                          summary: ActivitySummary;
                        }) => (
                          <ActivityCard
                            key={cardData.period}
                            period={cardData.period}
                            summary={toDisplaySummary(cardData.summary)}
                            dailyDistances={cardData.summary.dailyDistances}
                            interval={interval}
                            sportType={sportType}
                            activities={
                              interval === 'day'
                                ? cardData.summary.activities
                                : undefined
                            }
                          />
                        )
                      )}
                    </div>
                  )}
                </VirtualList>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityList;
