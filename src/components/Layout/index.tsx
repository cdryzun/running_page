import PropTypes from 'prop-types';
import React from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import useSiteMetadata from '@/hooks/useSiteMetadata';

const Layout = ({ children }: React.PropsWithChildren) => {
  const { siteTitle, description } = useSiteMetadata();

  return (
    <>
      <Helmet>
        <html lang="en" data-theme="dark" />
        <title>{siteTitle}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content="cycling, running, fitness, tracking, futuristic" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
      </Helmet>
      <div className="matrix-bg min-h-screen">
        <Header />
        <div className="mx-auto mb-16 max-w-7xl p-4 lg:flex lg:p-16 relative">
          <div className="scan-line absolute inset-0 pointer-events-none opacity-30"></div>
          {children}
        </div>
      </div>
    </>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default Layout;
