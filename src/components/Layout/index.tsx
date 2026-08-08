import PropTypes from 'prop-types';
import React, { useEffect } from 'react';
import Header from '@/components/Header';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import { IS_CHINESE } from '@/utils/const';

const Layout = ({ children }: React.PropsWithChildren) => {
  const { siteTitle, description } = useSiteMetadata();

  useEffect(() => {
    document.documentElement.lang = IS_CHINESE ? 'zh-CN' : 'en';
    document.title = siteTitle;

    let descriptionMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    if (!descriptionMeta) {
      descriptionMeta = document.createElement('meta');
      descriptionMeta.name = 'description';
      document.head.append(descriptionMeta);
    }
    descriptionMeta.content = description;
  }, [description, siteTitle]);

  return (
    <>
      <Header />
      <div className="mx-auto mb-16 max-w-screen-2xl p-4 lg:flex lg:p-16">
        {children}
      </div>
    </>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default Layout;
