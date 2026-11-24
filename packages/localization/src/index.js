import enAuth from '../locales/en/auth.json' with { type: 'json' };
import enCommon from '../locales/en/common.json' with { type: 'json' };
import enEmails from '../locales/en/emails.json' with { type: 'json' };
import enErrors from '../locales/en/errors.json' with { type: 'json' };
import enHabits from '../locales/en/habits.json' with { type: 'json' };
import enHome from '../locales/en/home.json' with { type: 'json' };
import enSettings from '../locales/en/settings.json' with { type: 'json' };
import trAuth from '../locales/tr/auth.json' with { type: 'json' };
import trCommon from '../locales/tr/common.json' with { type: 'json' };
import trEmails from '../locales/tr/emails.json' with { type: 'json' };
import trErrors from '../locales/tr/errors.json' with { type: 'json' };
import trHabits from '../locales/tr/habits.json' with { type: 'json' };
import trHome from '../locales/tr/home.json' with { type: 'json' };
import trSettings from '../locales/tr/settings.json' with { type: 'json' };

/** Language used when a client expresses no preference. */
export const DEFAULT_LANGUAGE = 'tr';

/** Languages with a complete catalog. Adding a language means adding a directory and an entry. */
export const SUPPORTED_LANGUAGES = Object.freeze(['tr', 'en']);

export const LANGUAGE_NAMES = Object.freeze({ tr: 'Türkçe', en: 'English' });

/** BCP 47 locale used for date and number formatting in each language. */
export const LANGUAGE_LOCALES = Object.freeze({ tr: 'tr-TR', en: 'en-US' });

/** Catalogs in the shape i18next expects: language -> namespace -> messages. */
export const resources = Object.freeze({
  tr: {
    auth: trAuth,
    common: trCommon,
    emails: trEmails,
    errors: trErrors,
    habits: trHabits,
    home: trHome,
    settings: trSettings,
  },
  en: {
    auth: enAuth,
    common: enCommon,
    emails: enEmails,
    errors: enErrors,
    habits: enHabits,
    home: enHome,
    settings: enSettings,
  },
});

export const NAMESPACES = Object.freeze(Object.keys(resources[DEFAULT_LANGUAGE]));

export function isSupportedLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language);
}

/**
 * Picks the best supported language from an Accept-Language header or a language tag.
 * Falls back to the default language.
 */
export function resolveLanguage(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return DEFAULT_LANGUAGE;
  }
  const candidates = input
    .split(',')
    .map((part) => {
      const [tag, quality] = part.trim().split(';q=');
      return { tag: tag.toLowerCase(), quality: quality === undefined ? 1 : Number(quality) };
    })
    .filter((candidate) => candidate.tag && !Number.isNaN(candidate.quality))
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of candidates) {
    const base = tag.split('-')[0];
    if (isSupportedLanguage(base)) {
      return base;
    }
  }
  return DEFAULT_LANGUAGE;
}

function lookup(catalog, path) {
  let node = catalog;
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object' || !(segment in node)) {
      return undefined;
    }
    node = node[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Framework-free translation for non-UI code (API messages, emails, notifications).
 * `key` has the form `namespace:path.to.message`. Missing messages fall back to the default
 * language and finally to the key itself.
 */
export function translate(language, key, params = {}) {
  const separator = key.indexOf(':');
  const namespace = separator === -1 ? 'common' : key.slice(0, separator);
  const path = separator === -1 ? key : key.slice(separator + 1);
  const chosen = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;

  const template =
    lookup(resources[chosen]?.[namespace], path) ??
    lookup(resources[DEFAULT_LANGUAGE]?.[namespace], path);
  if (template === undefined) {
    return key;
  }
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (match, name) =>
    params[name] === undefined || params[name] === null ? match : String(params[name]),
  );
}

/** True when a message exists for the key in the default language. */
export function hasTranslation(key) {
  const separator = key.indexOf(':');
  const namespace = separator === -1 ? 'common' : key.slice(0, separator);
  const path = separator === -1 ? key : key.slice(separator + 1);
  return lookup(resources[DEFAULT_LANGUAGE]?.[namespace], path) !== undefined;
}
