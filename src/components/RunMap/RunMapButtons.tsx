import useActivities from '@/hooks/useActivities';
import styles from './style.module.css';
import { IS_CHINESE } from '@/utils/const';

const RunMapButtons = ({
  changeYear,
  thisYear,
}: {
  changeYear: (_year: string) => void;
  thisYear: string;
}) => {
  const { years } = useActivities();
  const yearsButtons = years.slice();
  yearsButtons.push('Total');

  return (
    <ul className={styles.buttons}>
      {yearsButtons.map((year) => (
        <li
          key={`${year}button`}
          className={
            styles.button + ` ${year === thisYear ? styles.selected : ''}`
          }
          onClick={() => {
            changeYear(year);
          }}
        >
          {year === 'Total' && IS_CHINESE ? '全部' : year}
        </li>
      ))}
    </ul>
  );
};

export default RunMapButtons;
