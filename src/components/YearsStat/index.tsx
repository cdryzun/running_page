import { useMemo } from 'react';
import YearStat from '@/components/YearStat';
import YearCharts from '@/components/YearCharts';
import useActivities from '@/hooks/useActivities';
import { INFO_MESSAGE, type SportTypeFilter } from '@/utils/const';

const YearsStat = ({
  year,
  onClick,
  sportType = 'all',
}: {
  year: string;
  onClick: (_year: string) => void;
  sportType?: SportTypeFilter;
}) => {
  const { years } = useActivities();

  // Memoize the years array calculation
  const yearsArrayUpdate = useMemo(() => {
    // make sure the year click on front
    let updatedYears = years.slice();
    updatedYears.push('Total');
    updatedYears = updatedYears.filter((x) => x !== year);
    updatedYears.unshift(year);
    return updatedYears;
  }, [years, year]);

  const infoMessage = useMemo(() => {
    return INFO_MESSAGE(years.length, year);
  }, [years.length, year]);

  // for short solution need to refactor
  return (
    <div className="w-full pb-6 lg:pb-16 lg:pr-16">
      <YearCharts year={year} />
      <section className="pb-0">
        <p className="leading-relaxed">
          {infoMessage}
          <br />
        </p>
      </section>
      <hr className="my-4 lg:my-8" />
      {yearsArrayUpdate.map((yearItem) => (
        <YearStat
          key={yearItem}
          year={yearItem}
          onClick={onClick}
          sportType={sportType}
        />
      ))}
    </div>
  );
};

export default YearsStat;
