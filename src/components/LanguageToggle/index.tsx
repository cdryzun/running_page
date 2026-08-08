import { IS_CHINESE } from '@/utils/const';
import { persistLanguage, type Language } from '@/utils/language';

interface LanguageToggleProps {
  className?: string;
}

const LanguageToggle = ({ className }: LanguageToggleProps) => {
  const nextLanguage: Language = IS_CHINESE ? 'en' : 'zh-CN';
  const label = IS_CHINESE ? '切换到英文' : 'Switch to Chinese';

  const handleClick = () => {
    if (!persistLanguage(nextLanguage)) {
      window.alert(
        IS_CHINESE
          ? '无法保存语言设置，请检查浏览器存储权限。'
          : 'Unable to save the language setting. Check browser storage permissions.'
      );
      return;
    }
    window.location.reload();
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      aria-label={label}
      title={label}
    >
      {IS_CHINESE ? 'EN' : '中'}
    </button>
  );
};

export default LanguageToggle;
