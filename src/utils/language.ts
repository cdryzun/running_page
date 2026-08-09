export type Language = 'zh-CN' | 'en';

export const DEFAULT_LANGUAGE: Language = 'en';
export const LANGUAGE_STORAGE_KEY = 'language';

export const resolveLanguage = (value: string | null): Language =>
  value === 'zh-CN' ? 'zh-CN' : DEFAULT_LANGUAGE;

export const getStoredLanguage = (): Language => {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;

  try {
    return resolveLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

export const persistLanguage = (language: Language): boolean => {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    return true;
  } catch {
    return false;
  }
};
