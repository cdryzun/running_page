import Stat from '@/components/Stat';
import useActivities from '@/hooks/useActivities';
import { IS_CHINESE } from '@/utils/const';

// only support China for now
const LocationSummary = () => {
  const { years, countries, provinces, cities } = useActivities();
  return (
    <div className="cursor-pointer">
      <section>
        {years ? (
          <Stat
            value={`${years.length}`}
            description={IS_CHINESE ? ' 年运动记录' : ' years of records'}
          />
        ) : null}
        {countries ? (
          <Stat
            value={countries.length}
            description={IS_CHINESE ? ' 个国家' : ' countries'}
          />
        ) : null}
        {provinces ? (
          <Stat
            value={provinces.length}
            description={IS_CHINESE ? ' 个省份' : ' provinces'}
          />
        ) : null}
        {cities ? (
          <Stat
            value={Object.keys(cities).length}
            description={IS_CHINESE ? ' 个城市' : ' cities'}
          />
        ) : null}
      </section>
      <hr />
    </div>
  );
};

export default LocationSummary;
