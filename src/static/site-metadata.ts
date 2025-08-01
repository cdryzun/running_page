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
    siteTitle: 'Cycling Page',
  siteUrl: 'https://zaynrun.vercel.app',
  logo: 'https://avatars.githubusercontent.com/u/45552084?s=48&v=4',
  description: 'Personal cycling data and blog',
  navLinks: [
    {
      name: 'Summary',
      url: `${getBasePath()}/summary`,
    },
    {
      name: 'Blog',
      url: 'https://www.treesir.pub',
    },
    {
      name: 'About',
      url: 'https://github.com/cdryzun',
    },
  ],
};
export default data;
