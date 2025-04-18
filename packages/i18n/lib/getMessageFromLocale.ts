/**
 * This file is generated by generate-i18n.mjs
 * Do not edit this file directly
 */
import enMessage from '../locales/en/messages.json';
import trMessage from '../locales/tr/messages.json';

export function getMessageFromLocale(locale: string) {
  switch (locale) {
    case 'en':
      return enMessage;
    case 'tr':
      return trMessage;
    default:
      throw new Error('Unsupported locale');
  }
}

export const defaultLocale = (() => {
  const locales = ['en', 'tr'];
  const firstLocale = locales[0];
  const defaultLocale = Intl.DateTimeFormat().resolvedOptions().locale.replace('-', '_');
  if (locales.includes(defaultLocale)) {
    return defaultLocale;
  }
  const defaultLocaleWithoutRegion = defaultLocale.split('_')[0];
  if (locales.includes(defaultLocaleWithoutRegion)) {
    return defaultLocaleWithoutRegion;
  }
  return firstLocale;
})();
