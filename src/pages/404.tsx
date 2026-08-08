import Layout from '@/components/Layout';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import { IS_CHINESE } from '@/utils/const';

const NotFoundPage = () => {
  const { siteUrl } = useSiteMetadata();
  return (
    <Layout>
      <h1 className="my-2.5 text-5xl font-bold italic">404</h1>
      <p>{IS_CHINESE ? '页面不存在。' : "This page doesn't exist."}</p>
      <p className="text-gray-400">
        {IS_CHINESE ? '返回主页：' : 'Visit the home page: '}
        <a className="font-bold text-gray-400" href={siteUrl}>
          {siteUrl}
        </a>
      </p>
    </Layout>
  );
};

export default NotFoundPage;
