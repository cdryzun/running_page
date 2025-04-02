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

const data: ISiteMetadataResult = {
  siteTitle: 'Running Page',
  siteUrl: 'https://zaynrun.vercel.app',
  logo: 'https://avatars.githubusercontent.com/u/45552084?s=48&v=4',
  description: 'Personal site and blog',
  navLinks: [
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
