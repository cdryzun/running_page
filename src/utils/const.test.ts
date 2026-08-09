import { describe, expect, it } from 'vitest';
import { LIGHTS_ON, PRIVACY_MODE } from '@/utils/const';

describe('map startup configuration', () => {
  it('shows base-map tiles automatically', () => {
    expect(PRIVACY_MODE).toBe(false);
    expect(LIGHTS_ON).toBe(true);
  });
});
