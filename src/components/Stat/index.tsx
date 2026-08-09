import { intComma } from '@/utils/utils';

interface IStatProperties {
  value: string | number;
  description: string;
  className?: string;
  citySize?: number;
  onClick?: () => void;
}

const Stat = ({
  value,
  description,
  className = 'pb-2 w-full',
  citySize,
  onClick,
}: IStatProperties) => (
  <div
    className={`${className} flex flex-wrap items-baseline gap-x-2 gap-y-1`}
    onClick={onClick}
  >
    <span
      className={`${citySize ? 'text-3xl' : 'text-2xl sm:text-3xl lg:text-5xl'} font-bold italic`}
    >
      {intComma(value.toString())}
    </span>
    <span className="text-xs font-semibold italic sm:text-sm lg:text-lg">
      {description.trim()}
    </span>
  </div>
);

export default Stat;
