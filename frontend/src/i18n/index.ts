import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zh from './locales/zh.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],

    // Language detection options
    detection: {
      // Order of detection methods
      order: ['navigator', 'htmlTag', 'localStorage', 'cookie'],
      // Cache user language preference
      caches: ['localStorage'],
      // Convert zh-CN, zh-TW, etc. to zh
      convertDetectedLanguage: (lng: string) => {
        if (lng.startsWith('zh')) return 'zh';
        return lng.split('-')[0];
      },
    },

    interpolation: {
      escapeValue: false, // React already handles XSS
    },
  });

export default i18n;
