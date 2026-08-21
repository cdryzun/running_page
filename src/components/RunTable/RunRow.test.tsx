import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '@/utils/utils';
import RunRow from './RunRow';
import styles from './style.module.css';

const makeActivity = (runId: number, type: string): Activity => ({
  run_id: runId,
  name: '',
  distance: 10_000,
  moving_time: '3600',
  type,
  subtype: '',
  start_date: '2026-05-23T00:43:16Z',
  start_date_local: '2026-05-23T08:43:16',
  elevation_gain: 100,
  elevation_loss: 100,
  average_heartrate: 120,
  average_speed: 3,
  streak: 0,
});

describe('RunRow inline alignment', () => {
  it('uses a shared single-line title slot before activity metadata', () => {
    const locateActivity = vi.fn();
    const setRunIndex = vi.fn();

    render(
      <table>
        <tbody>
          <RunRow
            elementIndex={0}
            locateActivity={locateActivity}
            run={makeActivity(1, 'cycling')}
            runIndex={-1}
            setRunIndex={setRunIndex}
            sportType="all"
          />
          <RunRow
            elementIndex={1}
            locateActivity={locateActivity}
            run={makeActivity(2, 'hiking')}
            runIndex={-1}
            setRunIndex={setRunIndex}
            sportType="all"
          />
        </tbody>
      </table>
    );

    const cyclingTitle = screen.getByText('Cycling');
    const hikingTitle = screen.getByText('Hiking');

    expect(cyclingTitle.tagName).toBe('SPAN');
    expect(hikingTitle.tagName).toBe('SPAN');
    expect(cyclingTitle.className).not.toBe('');
    expect(hikingTitle.className).toBe(cyclingTitle.className);
    expect(cyclingTitle.nextElementSibling).toHaveClass(styles.rowMeta);
    expect(hikingTitle.nextElementSibling).toHaveClass(styles.rowMeta);
    expect(cyclingTitle.closest('td')?.querySelector('br')).toBeNull();
    expect(hikingTitle.closest('td')?.querySelector('br')).toBeNull();
  });
});
