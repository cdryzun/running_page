const ENGLISH_LOCATION_NAMES: Readonly<Record<string, string>> = {
  深圳市: 'Shenzhen',
  东莞市: 'Dongguan',
  邵阳市: 'Shaoyang',
  厦门市: 'Xiamen',
  四会市: 'Sihui',
  肇庆市: 'Zhaoqing',
  贺州市: 'Hezhou',
  桂林市: 'Guilin',
  韶关市: 'Shaoguan',
};

const ENGLISH_ACTIVITY_NAMES: Readonly<Record<string, string>> = {
  复合运动: 'Multi-sport',
  导航: 'Navigation',
};

export const getLocalizedLocationName = (
  name: string,
  isChinese: boolean
): string => (isChinese ? name : ENGLISH_LOCATION_NAMES[name] ?? name);

export const getLocalizedActivityTitle = (
  title: string,
  isChinese: boolean
): string => {
  if (isChinese) return title;

  const parts = title.trim().split(/\s+/);
  if (parts.length !== 2) return title;

  const location = ENGLISH_LOCATION_NAMES[parts[0]];
  const activity = ENGLISH_ACTIVITY_NAMES[parts[1]];
  return location && activity ? `${location} ${activity}` : title;
};

export const getLocalizedFilterTitle = (
  item: string,
  filterName: string,
  isChinese: boolean
): string => {
  if (isChinese) return `${item}活动轨迹`;

  const displayItem =
    filterName === 'City'
      ? getLocalizedLocationName(item, false)
      : filterName === 'Title'
        ? getLocalizedActivityTitle(item, false)
        : item;
  return `${displayItem} ${filterName} Activity Heatmap`;
};
