import * as mapboxPolyline from '@mapbox/polyline';
import gcoord from 'gcoord';
import { WebMercatorViewport } from '@math.gl/web-mercator';
import { chinaGeojson, RPGeometry } from '@/static/run_countries';
import worldGeoJson from '@surbowl/world-geo-json-zh/world.zh.json';
import { chinaCities } from '@/static/city';
import {
  MAIN_COLOR,
  MUNICIPALITY_CITIES_ARR,
  NEED_FIX_MAP,
  RUN_TITLES,
  ACTIVITY_TYPES,
  RICH_TITLE,
  CYCLING_COLOR,
  HIKING_COLOR,
  WALKING_COLOR,
  SWIMMING_COLOR,
  RUN_COLOR,
  RUN_TRAIL_COLOR,
  MAP_TILE_STYLES,
} from './const';
import {
  FeatureCollection,
  LineString,
  Feature,
  GeoJsonProperties,
} from 'geojson';

export type Coordinate = [number, number];

export type RunIds = Array<number> | [];

export interface Activity {
  run_id: number;
  name: string;
  distance: number;
  moving_time: string;
  type: string;
  subtype: string;
  start_date: string;
  start_date_local: string;
  location_country?: string | null;
  summary_polyline?: string | null;
  average_heartrate?: number | null;
  elevation_gain: number | null;
  average_speed: number;
  streak: number;
}

// 智能识别运动类型，根据活动名称纠正可能错误的类型标记
const getCorrectActivityType = (activity: Activity): string => {
  const name = activity.name.toLowerCase();

  // 如果名称包含明确的运动类型关键词，优先使用名称判断
  if (name.includes('骑行') || name.includes('cycling') || name.includes('bike')) {
    return 'Ride';
  }
  if (name.includes('跑步') || name.includes('running') || name.includes('run')) {
    return 'Run';
  }
  if (name.includes('徒步') || name.includes('hiking') || name.includes('hike')) {
    return 'hiking';
  }
  if (name.includes('步行') || name.includes('walking') || name.includes('walk')) {
    return 'Walk';
  }
  if (name.includes('游泳') || name.includes('swimming') || name.includes('swim')) {
    return 'swimming';
  }

  // 如果名称没有明确指示，使用原始类型
  return activity.type;
};

// 将运动类型转换为英文显示
const getEnglishActivityType = (activity: Activity): string => {
  const correctedType = getCorrectActivityType(activity);

  // 标准化运动类型映射
  const typeMapping: { [key: string]: string } = {
    'Run': 'RUNNING',
    'running': 'RUNNING',
    'Ride': 'CYCLING',
    'cycling': 'CYCLING',
    'Walk': 'WALKING',
    'walking': 'WALKING',
    'hiking': 'HIKING',
    'Hiking': 'HIKING',
    'swimming': 'SWIMMING',
    'Swimming': 'SWIMMING',
    'skiing': 'SKIING',
    'Skiing': 'SKIING',
    'VirtualRun': 'TREADMILL',
    'treadmill': 'TREADMILL'
  };

  // 检查子类型
  if (correctedType === 'Run' && activity.subtype) {
    if (activity.subtype === 'trail') return 'TRAIL RUN';
    if (activity.subtype === 'treadmill') return 'TREADMILL';
  }

  return typeMapping[correctedType] || correctedType.toUpperCase();
};

const titleForShow = (run: Activity): string => {
  const date = run.start_date_local.slice(0, 11);
  const distance = (run.distance / 1000.0).toFixed(2);
  let name = 'Run';
  if (run.name.slice(0, 7) === 'Running') {
    name = 'run';
  }
  if (run.name) {
    name = run.name;
  }
  return `${name} ${date} ${distance} KM ${
    !run.summary_polyline ? '(No map data for this run)' : ''
  }`;
};

const formatPace = (d: number, sportType: string = 'Run'): string => {
  if (Number.isNaN(d) || d === 0) return '0';
  
  // For cycling, show speed in km/h instead of pace
  if (['Ride', 'cycling', 'VirtualRide', 'Bike'].includes(sportType)) {
    const speed = d * 3.6; // convert m/s to km/h
    return `${speed.toFixed(1)} km/h`;
  }
  
  // For running, hiking, walking - show pace in min/km
  const pace = (1000.0 / 60.0) * (1.0 / d);
  const minutes = Math.floor(pace);
  const seconds = Math.floor((pace - minutes) * 60.0);
  return `${minutes}'${seconds.toFixed(0).toString().padStart(2, '0')}"`;
};

const convertMovingTime2Sec = (moving_time: string): number => {
  if (!moving_time) {
    return 0;
  }
  // moving_time : '2 days, 12:34:56' or '12:34:56';
  const splits = moving_time.split(', ');
  const days = splits.length == 2 ? parseInt(splits[0]) : 0;
  const time = splits.splice(-1)[0];
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const totalSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
  return totalSeconds;
};

const formatRunTime = (moving_time: string): string => {
  const totalSeconds = convertMovingTime2Sec(moving_time);
  const seconds = totalSeconds % 60;
  const minutes = (totalSeconds - seconds) / 60;
  if (minutes === 0) {
    return seconds + 's';
  }
  return minutes + 'min';
};

// for scroll to the map
const scrollToMap = () => {
  const el = document.querySelector('.fl.w-100.w-70-l');
  const rect = el?.getBoundingClientRect();
  if (rect) {
    window.scroll(rect.left + window.scrollX, rect.top + window.scrollY);
  }
};

const extractCities = (str: string): string[] => {
  const locations = [];
  let match;
  const pattern = /([\u4e00-\u9fa5]{2,}(市|自治州|特别行政区|盟|地区))/g;
  while ((match = pattern.exec(str)) !== null) {
    locations.push(match[0]);
  }

  return locations;
};

const extractDistricts = (str: string): string[] => {
  const locations = [];
  let match;
  const pattern = /([\u4e00-\u9fa5]{2,}(区|县))/g;
  while ((match = pattern.exec(str)) !== null) {
    locations.push(match[0]);
  }

  return locations;
};

const extractCoordinate = (str: string): [number, number] | null => {
  const pattern = /'latitude': ([-]?\d+\.\d+).*?'longitude': ([-]?\d+\.\d+)/;
  const match = str.match(pattern);

  if (match) {
    const latitude = parseFloat(match[1]);
    const longitude = parseFloat(match[2]);
    return [longitude, latitude];
  }

  return null;
};

const cities = chinaCities.map((c) => c.name);
const locationCache = new Map<number, ReturnType<typeof locationForRun>>();
// what about oversea?
const locationForRun = (
  run: Activity
): {
  country: string;
  province: string;
  city: string;
  coordinate: [number, number] | null;
} => {
  if (locationCache.has(run.run_id)) {
    return locationCache.get(run.run_id)!;
  }
  let location = run.location_country;
  let [city, province, country] = ['', '', ''];
  let coordinate = null;
  if (location) {
    // Only for Chinese now
    // should filter 臺灣
    const cityMatch = extractCities(location);
    const provinceMatch = location.match(/[\u4e00-\u9fa5]{2,}(省|自治区)/);

    if (cityMatch) {
      city = cities.find((value) => cityMatch.includes(value)) as string;

      if (!city) {
        city = '';
      }
    }
    if (provinceMatch) {
      [province] = provinceMatch;
      // try to extract city coord from location_country info
      coordinate = extractCoordinate(location);
    }
    const l = location.split(',');
    // or to handle keep location format
    let countryMatch = l[l.length - 1].match(
      /[\u4e00-\u9fa5].*[\u4e00-\u9fa5]/
    );
    if (!countryMatch && l.length >= 3) {
      countryMatch = l[2].match(/[\u4e00-\u9fa5].*[\u4e00-\u9fa5]/);
    }
    if (countryMatch) {
      [country] = countryMatch;
    }
  }
  if (MUNICIPALITY_CITIES_ARR.includes(city)) {
    province = city;
    if (location) {
      const districtMatch = extractDistricts(location);
      if (districtMatch.length > 0) {
        city = districtMatch[districtMatch.length - 1];
      }
    }
  }

  const r = { country, province, city, coordinate };
  locationCache.set(run.run_id, r);
  return r;
};

const intComma = (x = '') => {
  if (x.toString().length <= 5) {
    return x;
  }
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const pathForRun = (run: Activity): Coordinate[] => {
  try {
    if (!run.summary_polyline) {
      return [];
    }
    const c = mapboxPolyline.decode(run.summary_polyline);
    // reverse lat long for mapbox
    c.forEach((arr) => {
      [arr[0], arr[1]] = !NEED_FIX_MAP
        ? [arr[1], arr[0]]
        : gcoord.transform([arr[1], arr[0]], gcoord.GCJ02, gcoord.WGS84);
    });
    // try to use location city coordinate instead , if runpath is incomplete
    if (c.length === 2 && String(c[0]) === String(c[1])) {
      const { coordinate } = locationForRun(run);
      if (coordinate?.[0] && coordinate?.[1]) {
        return [coordinate, coordinate];
      }
    }
    return c;
  } catch (_err) {
    return [];
  }
};

const colorForRun = (run: Activity): string => {
  const correctedType = getCorrectActivityType(run);
  switch (correctedType) {
    case 'Run': {
      if (run.subtype === 'trail') {
        return RUN_TRAIL_COLOR;
      } else if (run.subtype === 'generic') {
        return RUN_COLOR;
      }
      return RUN_COLOR;
    }
    case 'Ride':
    case 'cycling':
      return CYCLING_COLOR;
    case 'hiking':
      return HIKING_COLOR;
    case 'walking':
    case 'Walk':
      return WALKING_COLOR;
    case 'swimming':
      return SWIMMING_COLOR;
    default:
      return RUN_COLOR; // 默认使用跑步颜色而不是骑行颜色
  }
};

const geoJsonForRuns = (runs: Activity[]): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: runs.map((run) => {
    const points = pathForRun(run);
    const color = colorForRun(run);
    return {
      type: 'Feature',
      properties: {
        color: color,
      },
      geometry: {
        type: 'LineString',
        coordinates: points,
      },
    };
  }),
});

const geoJsonForMap = (): FeatureCollection<RPGeometry> => ({
  type: 'FeatureCollection',
  features: [...worldGeoJson.features, ...chinaGeojson.features] as Feature<
    RPGeometry,
    GeoJsonProperties
  >[],
});

const getActivitySport = (act: Activity): string => {
  const correctedType = getCorrectActivityType(act);
  if (correctedType === 'Run') {
    if (act.subtype === 'generic') {
      const runDistance = act.distance / 1000;
      if (runDistance > 20 && runDistance < 40) {
        return RUN_TITLES.HALF_MARATHON_RUN_TITLE;
      } else if (runDistance >= 40) {
        return RUN_TITLES.FULL_MARATHON_RUN_TITLE;
      }
      return ACTIVITY_TYPES.RUN_GENERIC_TITLE;
    } else if (act.subtype === 'trail') return ACTIVITY_TYPES.RUN_TRAIL_TITLE;
    else if (act.subtype === 'treadmill')
      return ACTIVITY_TYPES.RUN_TREADMILL_TITLE;
    else return ACTIVITY_TYPES.RUN_GENERIC_TITLE;
  } else if (correctedType === 'Ride' || correctedType === 'cycling') {
    return ACTIVITY_TYPES.CYCLING_TITLE;
  } else if (correctedType === 'hiking') {
    return ACTIVITY_TYPES.HIKING_TITLE;
  } else if (correctedType === 'walking' || correctedType === 'Walk') {
    return ACTIVITY_TYPES.WALKING_TITLE;
  }
  // if correctedType contains 'skiing'
  else if (correctedType.includes('skiing')) {
    return ACTIVITY_TYPES.SKIING_TITLE;
  }
  return '';
};

const titleForRun = (run: Activity): string => {
  // 直接使用英文运动类型显示
  return getEnglishActivityType(run);
};

export interface IViewState {
  longitude?: number;
  latitude?: number;
  zoom?: number;
}

const getBoundsForGeoData = (
  geoData: FeatureCollection<LineString>
): IViewState => {
  const { features } = geoData;
  let points: Coordinate[] = [];
  // find first have data
  for (const f of features) {
    if (f.geometry.coordinates.length) {
      points = f.geometry.coordinates as Coordinate[];
      break;
    }
  }
  if (points.length === 0) {
    return { longitude: 20, latitude: 20, zoom: 3 };
  }
  if (points.length === 2 && String(points[0]) === String(points[1])) {
    return { longitude: points[0][0], latitude: points[0][1], zoom: 9 };
  }
  // Calculate corner values of bounds
  const pointsLong = points.map((point) => point[0]) as number[];
  const pointsLat = points.map((point) => point[1]) as number[];
  const cornersLongLat: [Coordinate, Coordinate] = [
    [Math.min(...pointsLong), Math.min(...pointsLat)],
    [Math.max(...pointsLong), Math.max(...pointsLat)],
  ];
  const viewState = new WebMercatorViewport({
    width: 800,
    height: 600,
  }).fitBounds(cornersLongLat, { padding: 200 });
  let { longitude, latitude, zoom } = viewState;
  if (features.length > 1) {
    zoom = 11.5;
  }
  return { longitude, latitude, zoom };
};

const filterYearRuns = (run: Activity, year: string) => {
  if (run && run.start_date_local) {
    return run.start_date_local.slice(0, 4) === year;
  }
  return false;
};

const filterCityRuns = (run: Activity, city: string) => {
  if (run && run.location_country) {
    return run.location_country.includes(city);
  }
  return false;
};
const filterTitleRuns = (run: Activity, title: string) =>
  titleForRun(run) === title;

const filterAndSortRuns = (
  activities: Activity[],
  item: string,
  filterFunc: (_run: Activity, _bvalue: string) => boolean,
  sortFunc: (_a: Activity, _b: Activity) => number
) => {
  let s = activities;
  if (item !== 'Total') {
    s = activities.filter((run) => filterFunc(run, item));
  }
  return s.sort(sortFunc);
};

const sortDateFunc = (a: Activity, b: Activity) => {
  return (
    new Date(b.start_date_local.replace(' ', 'T')).getTime() -
    new Date(a.start_date_local.replace(' ', 'T')).getTime()
  );
};
const sortDateFuncReverse = (a: Activity, b: Activity) => sortDateFunc(b, a);

const getMapStyle = (vendor: string, styleName: string, token: string) => {
  const style = (MAP_TILE_STYLES as any)[vendor][styleName];
  if (!style) {
    return MAP_TILE_STYLES.default;
  }
  if (vendor === 'maptiler' || vendor === 'stadiamaps') {
    return style + token;
  }
  return style;
};

const isTouchDevice = () =>
  'ontouchstart' in window || navigator.maxTouchPoints > 0;

export {
  titleForShow,
  formatPace,
  scrollToMap,
  locationForRun,
  intComma,
  pathForRun,
  geoJsonForRuns,
  geoJsonForMap,
  titleForRun,
  filterYearRuns,
  filterCityRuns,
  filterTitleRuns,
  filterAndSortRuns,
  sortDateFunc,
  sortDateFuncReverse,
  getBoundsForGeoData,
  formatRunTime,
  convertMovingTime2Sec,
  getMapStyle,
  isTouchDevice,
};
