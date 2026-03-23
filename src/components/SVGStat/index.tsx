import { lazy, Suspense, useEffect, useMemo } from 'react';
import { totalStat } from '@assets/index';
import { loadSvgComponent } from '@/utils/svgUtils';
import { initSvgColorAdjustments } from '@/utils/colorUtils';
import { SPORT_TYPE_OPTIONS, type SportTypeFilter } from '@/utils/const';

const SVGStat = ({
  sportType = 'all',
  onSportTypeChange,
}: {
  sportType?: SportTypeFilter;
  onSportTypeChange?: (_sportType: SportTypeFilter) => void;
}) => {
  useEffect(() => {
    // Initialize SVG color adjustments when component mounts
    const timer = setTimeout(() => {
      initSvgColorAdjustments();
    }, 100); // Small delay to ensure SVG is rendered

    return () => clearTimeout(timer);
  }, []);

  const GithubSvg = useMemo(
    () => lazy(() => loadSvgComponent(totalStat, './github.svg')),
    []
  );
  const GridSvg = useMemo(
    () => lazy(() => loadSvgComponent(totalStat, './grid.svg')),
    []
  );

  return (
    <div id="svgStat">
      {onSportTypeChange && (
        <div className="mb-2 mt-4 flex justify-end">
          <select
            className="rounded border border-gray-600 bg-transparent px-2 py-1 text-sm"
            value={sportType}
            onChange={(e) =>
              onSportTypeChange(e.target.value as SportTypeFilter)
            }
          >
            {SPORT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <Suspense fallback={<div className="text-center">Loading...</div>}>
        <GithubSvg className="github-svg mt-4 h-auto w-full" />
        <GridSvg className="grid-svg mt-4 h-auto w-full" />
      </Suspense>
    </div>
  );
};

export default SVGStat;
