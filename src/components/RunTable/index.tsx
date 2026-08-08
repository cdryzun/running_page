import React, { useState, useMemo, useCallback } from 'react';
import {
  sortDateFunc,
  sortDateFuncReverse,
  convertMovingTime2Sec,
  Activity,
  RunIds,
} from '@/utils/utils';
import {
  IS_CHINESE,
  SHOW_ELEVATION_GAIN,
  type SportTypeFilter,
} from '@/utils/const';
import { DIST_UNIT } from '@/utils/utils';
import {
  getPrimaryMetricLabel,
  getPrimaryMetricSortValue,
} from '@/utils/sportMetrics';

import RunRow from './RunRow';
import styles from './style.module.css';

interface IRunTableProperties {
  runs: Activity[];
  locateActivity: (_runIds: RunIds) => void;
  setActivity: (_runs: Activity[]) => void;
  runIndex: number;
  sportType?: SportTypeFilter;
  setRunIndex: (_index: number) => void;
}

type SortFunc = (_a: Activity, _b: Activity) => number;

const ELEVATION_COLUMN_TITLE = IS_CHINESE ? '爬升' : 'Elev';
const HEART_RATE_COLUMN_TITLE = IS_CHINESE ? '心率' : 'BPM';
const TIME_COLUMN_TITLE = IS_CHINESE ? '时长' : 'Time';
const DATE_COLUMN_TITLE = IS_CHINESE ? '日期' : 'Date';

const RunTable = ({
  runs,
  locateActivity,
  setActivity,
  runIndex,
  sportType = 'all',
  setRunIndex,
}: IRunTableProperties) => {
  const [sortFuncInfo, setSortFuncInfo] = useState('');
  const primaryMetricLabel = getPrimaryMetricLabel(sportType);

  // Memoize sort functions to prevent recreating them on every render
  const sortFunctions = useMemo(() => {
    const compareNullableNumber = (
      aValue: number | null | undefined,
      bValue: number | null | undefined,
      ascending: boolean
    ): number => {
      const aMissing = aValue === null || aValue === undefined;
      const bMissing = bValue === null || bValue === undefined;
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return ascending ? aValue - bValue : bValue - aValue;
    };

    const sortKMFunc: SortFunc = (a, b) =>
      sortFuncInfo === DIST_UNIT
        ? a.distance - b.distance
        : b.distance - a.distance;
    const sortElevationGainFunc: SortFunc = (a, b) =>
      compareNullableNumber(
        a.elevation_gain,
        b.elevation_gain,
        sortFuncInfo === ELEVATION_COLUMN_TITLE
      );
    const sortPrimaryMetricFunc: SortFunc = (a, b) => {
      const aValue = getPrimaryMetricSortValue(a, sportType);
      const bValue = getPrimaryMetricSortValue(b, sportType);
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      return sortFuncInfo === primaryMetricLabel
        ? aValue - bValue
        : bValue - aValue;
    };
    const sortBPMFunc: SortFunc = (a, b) => {
      return compareNullableNumber(
        a.average_heartrate,
        b.average_heartrate,
        sortFuncInfo === HEART_RATE_COLUMN_TITLE
      );
    };
    const sortRunTimeFunc: SortFunc = (a, b) => {
      const aTotalSeconds = convertMovingTime2Sec(a.moving_time);
      const bTotalSeconds = convertMovingTime2Sec(b.moving_time);
      return sortFuncInfo === TIME_COLUMN_TITLE
        ? aTotalSeconds - bTotalSeconds
        : bTotalSeconds - aTotalSeconds;
    };
    const sortDateFuncClick =
      sortFuncInfo === DATE_COLUMN_TITLE ? sortDateFuncReverse : sortDateFunc;

    const sortFuncMap = new Map([
      [DIST_UNIT, sortKMFunc],
      [ELEVATION_COLUMN_TITLE, sortElevationGainFunc],
      [primaryMetricLabel, sortPrimaryMetricFunc],
      [HEART_RATE_COLUMN_TITLE, sortBPMFunc],
      [TIME_COLUMN_TITLE, sortRunTimeFunc],
      [DATE_COLUMN_TITLE, sortDateFuncClick],
    ]);

    if (!SHOW_ELEVATION_GAIN) {
      sortFuncMap.delete(ELEVATION_COLUMN_TITLE);
    }

    return sortFuncMap;
  }, [sortFuncInfo, primaryMetricLabel, sportType]);

  const handleClick = useCallback<React.MouseEventHandler<HTMLElement>>(
    (e) => {
      const funcName = (e.currentTarget as HTMLElement).dataset.sortKey || '';
      const f = sortFunctions.get(funcName);
      if (!f) return;

      setRunIndex(-1);
      setSortFuncInfo(sortFuncInfo === funcName ? '' : funcName);
      setActivity([...runs].sort(f));
    },
    [sortFunctions, sortFuncInfo, runs, setRunIndex, setActivity]
  );

  return (
    <div className={styles.tableContainer}>
      <table className={styles.runTable} cellSpacing="0" cellPadding="0">
        <thead>
          <tr>
            <th>{IS_CHINESE ? '活动' : 'Activity'}</th>
            {Array.from(sortFunctions.keys()).map((k) => (
              <th key={k} data-sort-key={k} onClick={handleClick}>
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run, elementIndex) => (
            <RunRow
              key={run.run_id}
              elementIndex={elementIndex}
              locateActivity={locateActivity}
              run={run}
              runIndex={runIndex}
              sportType={sportType}
              setRunIndex={setRunIndex}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RunTable;
