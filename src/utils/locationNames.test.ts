import { describe, expect, it } from 'vitest';
import {
  getLocalizedActivityTitle,
  getLocalizedFilterTitle,
  getLocalizedLocationName,
} from './locationNames';

const cityNames = [
  ['深圳市', 'Shenzhen'],
  ['东莞市', 'Dongguan'],
  ['邵阳市', 'Shaoyang'],
  ['厦门市', 'Xiamen'],
  ['四会市', 'Sihui'],
  ['肇庆市', 'Zhaoqing'],
  ['贺州市', 'Hezhou'],
  ['桂林市', 'Guilin'],
  ['韶关市', 'Shaoguan'],
];

describe('location name localization', () => {
  it.each(cityNames)('maps %s to %s in English', (chinese, english) => {
    expect(getLocalizedLocationName(chinese, false)).toBe(english);
    expect(getLocalizedLocationName(chinese, true)).toBe(chinese);
  });

  it('preserves unknown location names instead of guessing', () => {
    expect(getLocalizedLocationName('未知地点', false)).toBe('未知地点');
  });

  it('localizes known location-based activity titles', () => {
    expect(getLocalizedActivityTitle('深圳市 复合运动', false)).toBe(
      'Shenzhen Multi-sport'
    );
    expect(getLocalizedActivityTitle('深圳市 导航', false)).toBe(
      'Shenzhen Navigation'
    );
    expect(getLocalizedActivityTitle('深圳市 复合运动', true)).toBe(
      '深圳市 复合运动'
    );
  });

  it('normalizes missing activity titles', () => {
    expect(getLocalizedActivityTitle(null, false)).toBe('');
    expect(getLocalizedActivityTitle(undefined, true)).toBe('');
  });

  it('localizes map titles without changing their filter keys', () => {
    expect(getLocalizedFilterTitle('深圳市', 'City', false)).toBe(
      'Shenzhen City Activity Heatmap'
    );
    expect(getLocalizedFilterTitle('深圳市 复合运动', 'Title', false)).toBe(
      'Shenzhen Multi-sport Title Activity Heatmap'
    );
    expect(getLocalizedFilterTitle('2026', 'Year', false)).toBe(
      '2026 Year Activity Heatmap'
    );
    expect(getLocalizedFilterTitle('深圳市', 'City', true)).toBe(
      '深圳市活动轨迹'
    );
  });
});
