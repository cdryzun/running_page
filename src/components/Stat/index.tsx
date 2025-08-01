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
    className={`${className} cursor-pointer transition-all duration-300 hover:scale-105`}
    onClick={onClick}
    style={{
      background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.08) 0%, rgba(0, 212, 255, 0.05) 50%, rgba(0, 255, 136, 0.08) 100%)',
      border: '1px solid rgba(0, 255, 136, 0.4)',
      borderRadius: '12px',
      padding: '1.5rem 1.25rem',
      margin: '0.75rem 0',
      backdropFilter: 'blur(15px)',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 0 20px rgba(0, 255, 136, 0.1), inset 0 1px 0 rgba(0, 255, 136, 0.1)',
      minHeight: '120px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center'
    }}
  >
    <span
      className="font-bold geometric-font glow-text block"
      style={{
        color: 'var(--color-glow, #00ff88)',
        textShadow: '0 0 15px var(--color-glow, #00ff88)',
        letterSpacing: '0.05em',
        fontSize: citySize ? `${Math.max(2.5, citySize * 0.8)}rem` : '2.5rem',
        lineHeight: '1.1',
        marginBottom: '0.5rem'
      }}
    >
      {intComma(value.toString())}
    </span>
    <span
      className="font-medium terminal-font block"
      style={{
        color: 'var(--color-tx, #e8e8e8)',
        opacity: 0.85,
        letterSpacing: '0.02em',
        fontSize: '0.9rem',
        textTransform: 'uppercase',
        fontWeight: '500'
      }}
    >
      {description}
    </span>
  </div>
);

export default Stat;
