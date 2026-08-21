import Stat from '@/components/Stat';
import useActivities from '@/hooks/useActivities';
import { DIST_UNIT, M_TO_DIST } from '@/utils/utils';
import { IS_CHINESE } from '@/utils/const';
import { getLocalizedLocationName } from '@/utils/locationNames';

// only support China for now
const CitiesStat = ({ onClick }: { onClick: (_city: string) => void }) => {
  const { cities } = useActivities();

  const citiesArr = Object.entries(cities);
  citiesArr.sort((a, b) => b[1] - a[1]);
  return (
    <div className="cursor-pointer">
      <section>
        {citiesArr.map(([city, distance]) => (
          <Stat
            key={city}
            value={getLocalizedLocationName(city, IS_CHINESE)}
            description={` ${(distance / M_TO_DIST).toFixed(0)} ${DIST_UNIT}`}
            citySize={3}
            onClick={() => onClick(city)}
          />
        ))}
      </section>
      <hr />
    </div>
  );
};

export default CitiesStat;
