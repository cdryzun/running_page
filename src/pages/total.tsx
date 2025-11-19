import ActivityList from '@/components/ActivityList';
import Layout from '@/components/Layout';
import { Helmet } from 'react-helmet-async';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import { IS_CHINESE } from '@/utils/const';

const SummaryPage = () => {
  const { siteTitle } = useSiteMetadata();

  return (
    <Layout>
      <Helmet>
        <html lang="en" data-theme="dark" />
        <title>
          {IS_CHINESE ? '数据总览 - ' : 'Summary - '}
          {siteTitle}
        </title>
      </Helmet>

      {/* Header Section */}
      <div className="mb-8 w-full">
        <div className="mb-12 text-center">
          <h1
            className="geometric-font glow-text mb-4 text-5xl font-extrabold"
            style={{
              color: 'var(--color-glow, #00ff88)',
              textShadow: '0 0 20px var(--color-glow, #00ff88)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {IS_CHINESE ? '数据总览' : 'Activity Summary'}
          </h1>
          <p
            className="terminal-font text-xl"
            style={{
              color: 'var(--color-tx, #e8e8e8)',
              opacity: 0.8,
              letterSpacing: '0.05em',
            }}
          >
            {IS_CHINESE
              ? '全面分析运动数据'
              : 'Comprehensive Analysis of Your Activities'}
          </p>
        </div>

        {/* Decorative Line */}
        <div
          className="mb-8 h-px w-full"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, var(--color-glow, #00ff88) 50%, transparent 100%)',
            boxShadow: '0 0 10px var(--color-glow, #00ff88)',
          }}
        />
      </div>

      {/* Activity List */}
      <div className="w-full">
        <ActivityList />
      </div>
    </Layout>
  );
};

export default SummaryPage;
