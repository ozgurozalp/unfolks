import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from '@src/locales/tr.json';
import en from '@src/locales/en.json';

const TR_LANGUAGES = ['tr', 'tr-TR', 'tr-tr'];
const defaultLanguage = TR_LANGUAGES.includes(navigator.language) ? 'tr' : 'en';

i18n.use(initReactI18next).init({
  fallbackLng: 'en',
  lng: defaultLanguage,
  debug: false,
  resources: {
    tr,
    en,
  },
  interpolation: {
    escapeValue: false, // not needed for react as it escapes by default
  },
});

export const { t } = i18n;

export default i18n;
