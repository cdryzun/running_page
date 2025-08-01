import { Link } from 'react-router-dom';
import useSiteMetadata from '@/hooks/useSiteMetadata';

const Header = () => {
  const { logo, siteUrl, navLinks } = useSiteMetadata();

  return (
    <>
      <nav className="mx-auto mt-12 flex w-full max-w-7xl items-center justify-between pl-6 lg:px-16">
        <div className="w-1/4">
          <Link to={siteUrl}>
            <picture>
              <img
                className="h-16 w-16 rounded-full glow-border pulse-glow"
                alt="logo"
                src={logo}
                style={{
                  filter: 'drop-shadow(0 0 10px var(--color-glow, #00ff88))'
                }}
              />
            </picture>
          </Link>
        </div>
        <div className="w-3/4 text-right">
          {navLinks.map((n, i) => (
            <a
              key={i}
              href={n.url}
              className="cyber-button mr-3 text-lg lg:mr-4 lg:text-base inline-block"
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.9rem',
                textDecoration: 'none'
              }}
            >
              {n.name}
            </a>
          ))}
        </div>
      </nav>
    </>
  );
};

export default Header;
