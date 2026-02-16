import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zh from './locales/zh.json';

const SUPPORTED_LANGS = ['en', 'zh'];

function normalizeLang(lng: string): string {
  if (lng.startsWith('zh')) return 'zh';
  const base = lng.split('-')[0];
  return SUPPORTED_LANGS.includes(base) ? base : 'en';
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGS,

    // Language detection options
    detection: {
      // localStorage first (user's explicit choice), then navigator (device language)
      order: ['localStorage', 'navigator', 'htmlTag'],
      // Cache user language preference
      caches: ['localStorage'],
      convertDetectedLanguage: normalizeLang,
    },

    interpolation: {
      escapeValue: false, // React already handles XSS
    },
  });

// On native Android, navigator.language may not reflect device locale in older WebViews.
// Use @capacitor/device to get the real device language on first launch.
async function detectNativeLanguage() {
  // Skip if user already has a saved preference
  if (localStorage.getItem('i18nextLng')) return;

  try {
    const { Device } = await import('@capacitor/device');
    const { value } = await Device.getLanguageCode();
    if (value) {
      const lang = normalizeLang(value);
      if (lang !== i18n.language) {
        i18n.changeLanguage(lang);
      }
    }
  } catch {
    // Not on native or plugin unavailable — navigator detection is fine
  }
}

detectNativeLanguage();

export default i18n;
