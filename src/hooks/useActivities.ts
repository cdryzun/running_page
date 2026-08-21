import { useMemo } from 'react';
import { type Activity, locationForRun, titleForRun } from '@/utils/utils';
import activities from '@/static/activities.json';
import { COUNTRY_STANDARDIZATION } from '@/static/city';

const standardizeCountryName = (country: string): string => {
  for (const [pattern, standardName] of COUNTRY_STANDARDIZATION) {
    if (country.includes(pattern)) {
      return standardName;
    }
  }
  return country;
};

export const getActivityRegions = (activityList: Activity[]) => {
  const provinces = new Set<string>();
  const countries = new Set<string>();

  activityList.forEach((run) => {
    const { country, province } = locationForRun(run);
    if (province) provinces.add(province);
    if (country) countries.add(standardizeCountryName(country));
  });

  return { countries: [...countries], provinces: [...provinces] };
};

const useActivities = () => {
  const processedData = useMemo(() => {
    const cities: Record<string, number> = {};
    const runPeriod: Record<string, number> = {};
    const years: Set<string> = new Set();

    activities.forEach((run) => {
      const location = locationForRun(run);

      const periodName = titleForRun(run);
      if (periodName) {
        runPeriod[periodName] = runPeriod[periodName]
          ? runPeriod[periodName] + 1
          : 1;
      }

      const { city } = location;
      // drop only one char city
      if (city.length > 1) {
        cities[city] = cities[city]
          ? cities[city] + run.distance
          : run.distance;
      }
      const year = run.start_date_local.slice(0, 4);
      years.add(year);
    });

    const yearsArray = [...years].sort().reverse();
    const thisYear = yearsArray[0] || '';
    const { countries, provinces } = getActivityRegions(activities);

    return {
      activities,
      years: yearsArray,
      countries,
      provinces,
      cities,
      runPeriod,
      thisYear,
    };
  }, []); // Empty dependency array since activities is static

  return processedData;
};

export default useActivities;
