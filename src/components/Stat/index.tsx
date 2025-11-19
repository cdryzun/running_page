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
    className={`${className} cursor-pointer hover-lift fade-in`}
    onClick={onClick}
    style={{
      background: 'var(--color-activity-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '12px',
      padding: '1.5rem 1.25rem',
      margin: '0.75rem 0',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 1px 3px var(--color-shadow)',
      minHeight: '120px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center'
    }}
  >
    <span
      className="font-bold block"
      style={{
        color: 'var(--color-brand)',
        fontSize: citySize ? `${Math.max(2.5, citySize * 0.8)}rem` : '2.5rem',
        lineHeight: '1.1',
        marginBottom: '0.5rem',
        fontFamily: 'var(--font-sans)'
      }}
    >
      {intComma(value.toString())}
    </span>
    <span
      className="font-medium block"
      style={{
        color: 'var(--color-secondary)',
        fontSize: '0.875rem',
        textTransform: 'uppercase',
        fontWeight: '500',
        letterSpacing: '0.05em'
      }}
    >
      {description}
    </span>
  </div>
);

export default Stat;
