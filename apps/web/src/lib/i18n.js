import {
  DEFAULT_LANGUAGE,
  LANGUAGE_LOCALES,
  NAMESPACES,
  isSupportedLanguage,
  resources,
} from '@personalitify/localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readStored, writeStored } from './storage.js';

const stored = readStored('language');

i18n.use(initReactI18next).init({
  resources,
  lng: isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  ns: NAMESPACES,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

function applyDocumentLanguage(language) {
  document.documentElement.lang = language;
}

applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', (language) => {
  applyDocumentLanguage(language);
  writeStored('language', language);
});

/** Switches the interface language. Unknown languages are ignored. */
export function setLanguage(language) {
  if (isSupportedLanguage(language) && language !== i18n.language) {
    return i18n.changeLanguage(language);
  }
  return Promise.resolve();
}

/** BCP 47 locale for Intl formatting in the current interface language. */
export function currentLocale() {
  return LANGUAGE_LOCALES[i18n.language] ?? LANGUAGE_LOCALES[DEFAULT_LANGUAGE];
}

export { i18n };
