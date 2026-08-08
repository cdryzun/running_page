import { IS_CHINESE } from '@/utils/const';

interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const getBasePath = () => {
  const baseUrl = import.meta.env.BASE_URL;
  return baseUrl === '/' ? '' : baseUrl;
};

const data: ISiteMetadataResult = {
  siteTitle: IS_CHINESE ? '运动记录' : 'Activity Page',
  siteUrl: 'https://run.treesir.pub',
  logo: 'https://avatars.githubusercontent.com/u/45552084?s=256&v=4',
  description: IS_CHINESE
    ? '个人运动记录与博客'
    : 'Personal activity records and blog',
  navLinks: [
    {
      name: IS_CHINESE ? '汇总' : 'Summary',
      url: `${getBasePath()}/summary`,
    },
    {
      name: IS_CHINESE ? '博客' : 'Blog',
      url: 'https://www.treesir.pub',
    },
    {
      name: IS_CHINESE ? '关于' : 'About',
      url: 'https://github.com/cdryzun',
    },
  ],
};

export default data;
