import Stat from '@/components/Stat';
import useActivities from '@/hooks/useActivities';
import { IS_CHINESE } from '@/utils/const';
import { getLocalizedActivityTitle } from '@/utils/locationNames';

const PeriodStat = ({ onClick }: { onClick: (_period: string) => void }) => {
  const { runPeriod } = useActivities();

  const periodArr = Object.entries(runPeriod);
  periodArr.sort((a, b) => b[1] - a[1]);
  return (
    <div className="cursor-pointer">
      <section>
        {periodArr.map(([period, times]) => (
          <Stat
            key={period}
            value={getLocalizedActivityTitle(period, IS_CHINESE)}
            description={
              IS_CHINESE ? ` ${times} 次活动` : ` ${times} activities`
            }
            citySize={3}
            onClick={() => onClick(period)}
          />
        ))}
      </section>
      <hr />
    </div>
  );
};

export default PeriodStat;
