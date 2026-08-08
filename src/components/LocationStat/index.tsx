import YearStat from '@/components/YearStat';
import {
  LOCATION_INFO_MESSAGE_FIRST,
  LOCATION_INFO_MESSAGE_SECOND,
} from '@/utils/const';
import CitiesStat from './CitiesStat';
import LocationSummary from './LocationSummary';
import PeriodStat from './PeriodStat';

interface ILocationStatProps {
  changeYear: (_year: string) => void;
  changeCity: (_city: string) => void;
  changeTitle: (_title: string) => void;
}

const LocationStat = ({
  changeYear,
  changeCity,
  changeTitle,
}: ILocationStatProps) => (
  <div className="w-full pb-16 lg:w-full lg:pr-16">
    <section className="pb-0">
      <p className="leading-relaxed">
        {LOCATION_INFO_MESSAGE_FIRST}
        <br />
        {LOCATION_INFO_MESSAGE_SECOND}
      </p>
    </section>
    <hr />
    <LocationSummary />
    <CitiesStat onClick={changeCity} />
    <PeriodStat onClick={changeTitle} />
    <YearStat year="Total" onClick={changeYear} />
  </div>
);

export default LocationStat;
