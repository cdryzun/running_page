import { describe, expect, it } from 'vitest';
import type { Activity } from '@/utils/utils';
import { getActivityRegions } from './useActivities';

const makeActivity = (
  runId: number,
  locationCountry: string | null
): Activity => ({
  run_id: runId,
  name: '',
  distance: 1_000,
  moving_time: '300',
  type: 'running',
  subtype: '',
  start_date: '2026-01-01T00:00:00Z',
  start_date_local: '2026-01-01T08:00:00',
  location_country: locationCountry,
  elevation_gain: 0,
  average_speed: 3,
  streak: 0,
});

describe('getActivityRegions', () => {
  it('returns unique standardized regions from only the supplied activities', () => {
    const regions = getActivityRegions([
      makeActivity(900_001, '深圳市, 广东省, 中国'),
      makeActivity(900_002, '肇庆市, 广东省, 中国'),
      makeActivity(900_003, '邵阳市, 湖南省, 中国'),
      makeActivity(900_004, '纽约市, 美利坚合众国'),
      makeActivity(900_005, null),
    ]);

    expect(regions).toEqual({
      countries: ['中国', '美国'],
      provinces: ['广东省', '湖南省'],
    });
  });
});
