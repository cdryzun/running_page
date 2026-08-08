import styles from './style.module.css';
import { IS_CHINESE } from '@/utils/const';

interface ILightsProps {
  setLights: (_lights: boolean) => void;
  lights: boolean;
}

const LightsControl = ({ setLights, lights }: ILightsProps) => {
  const label = IS_CHINESE
    ? lights
      ? '隐藏地图底图'
      : '显示地图底图'
    : `Turn ${lights ? 'off' : 'on'} the map background`;
  return (
    <div className={'mapboxgl-ctrl mapboxgl-ctrl-group  ' + styles.lights}>
      <button
        type="button"
        aria-label={label}
        title={label}
        className={`${lights ? styles.lightsOn : styles.lightsOff}`}
        onClick={() => setLights(!lights)}
      >
        <span className="mapboxgl-ctrl-icon" aria-hidden="true" />
      </button>
    </div>
  );
};

export default LightsControl;
