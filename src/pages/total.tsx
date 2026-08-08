import ActivityList from '@/components/ActivityList';
import { useTheme } from '@/hooks/useTheme';
import { useEffect } from 'react';
import { IS_CHINESE } from '@/utils/const';

const HomePage = () => {
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.lang = IS_CHINESE ? 'zh-CN' : 'en';
    document.documentElement.setAttribute('data-theme', theme);
    document.title = IS_CHINESE ? '运动汇总' : 'Activity Summary';
  }, [theme]);

  return <ActivityList />;
};

export default HomePage;
