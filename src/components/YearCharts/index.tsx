import { lazy, Suspense, useMemo, type FC } from 'react';
import { githubYearStats, yearStats } from '@assets/index';
import { IS_CHINESE, LOADING_TEXT } from '@/utils/const';
import { loadSvgComponent } from '@/utils/svgUtils';

type YearChartsProps = {
  year: string;
};

export const getYearChartPaths = (year: string, isChinese: boolean) => {
  const suffix = isChinese ? '_zh' : '';
  return {
    year: `./year_${year}${suffix}.svg`,
    github: `./github_${year}${suffix}.svg`,
  };
};

const YearCharts: FC<YearChartsProps> = ({ year }) => {
  const paths = getYearChartPaths(year, IS_CHINESE);
  const YearSVG = useMemo(
    () => lazy(() => loadSvgComponent(yearStats, paths.year)),
    [paths.year]
  );
  const GithubYearSVG = useMemo(
    () => lazy(() => loadSvgComponent(githubYearStats, paths.github)),
    [paths.github]
  );

  if (year === 'Total') return null;

  return (
    <div
      className="mb-4 flex h-72 flex-col gap-0 overflow-hidden lg:mb-8 lg:h-[32rem]"
      role="region"
      aria-label={IS_CHINESE ? '年度图表' : 'Year charts'}
    >
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-start">
            {LOADING_TEXT}
          </div>
        }
      >
        <YearSVG
          className="year-svg block min-h-0 w-full flex-[200] border-0 p-0"
          preserveAspectRatio="xMinYMid meet"
        />
        <GithubYearSVG
          className="github-year-svg block min-h-0 w-full flex-[98] border-0 p-0"
          preserveAspectRatio="xMinYMid meet"
        />
      </Suspense>
    </div>
  );
};

export default YearCharts;
