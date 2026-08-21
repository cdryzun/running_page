import { describe, expect, it, vi } from 'vitest';
import type { Activity } from './utils';

vi.mock('@/utils/const', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/const')>();
  return { ...actual, IS_CHINESE: false };
});

import { titleForRun, titleForShow } from './utils';

const makeActivity = (type: string, name: string): Activity => ({
  run_id: 1,
  name,
  distance: 10_000,
  moving_time: '3600',
  type,
  subtype: '',
  start_date: '2026-05-23T00:43:16Z',
  start_date_local: '2026-05-23T08:43:16',
  summary_polyline: '',
  average_speed: 3,
  streak: 0,
});

describe('titleForShow English activity names', () => {
  it('uses the localized sport label instead of a Chinese source name', () => {
    const title = titleForShow(makeActivity('cycling', '晚间骑行'));

    expect(title).toMatch(/^Cycling /);
    expect(title).not.toMatch(/[\u3400-\u9fff]/);
  });

  it('preserves meaningful English custom activity names', () => {
    const title = titleForShow(makeActivity('cycling', 'Tour de France'));

    expect(title).toMatch(/^Tour de France /);
  });

  it('localizes supported custom activity titles', () => {
    const title = titleForShow(makeActivity('multi_sport', '深圳市 复合运动'));

    expect(title).toMatch(/^Shenzhen Multi-sport /);
    expect(title).not.toMatch(/[\u3400-\u9fff]/);
  });

  it('localizes custom names used by activity lists', () => {
    expect(titleForRun(makeActivity('multi_sport', '深圳市 复合运动'))).toBe(
      'Shenzhen Multi-sport'
    );
  });
});
