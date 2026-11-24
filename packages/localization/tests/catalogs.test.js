import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  NAMESPACES,
  SUPPORTED_LANGUAGES,
  resolveLanguage,
  resources,
} from '../src/index.js';

const localesDir = new URL('../locales/', import.meta.url);

function flatten(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object' ? flatten(value, path) : [[path, value]];
  });
}

const placeholders = (text) => [...String(text).matchAll(/{{\s*([\w.]+)\s*}}/g)].map((m) => m[1]);

describe('localization catalogs', () => {
  it('registers every namespace file that exists on disk', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const files = readdirSync(new URL(`${language}/`, localesDir))
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace('.json', ''))
        .sort();
      expect(files, `namespaces registered for ${language}`).toEqual([...NAMESPACES].sort());
      expect(Object.keys(resources[language]).sort()).toEqual(files);
    }
  });

  it('keeps identical keys and placeholders in every language', () => {
    for (const namespace of NAMESPACES) {
      const reference = new Map(flatten(resources[DEFAULT_LANGUAGE][namespace]));
      for (const language of SUPPORTED_LANGUAGES) {
        const entries = new Map(flatten(resources[language][namespace]));
        expect([...entries.keys()].sort(), `${language}/${namespace} keys`).toEqual(
          [...reference.keys()].sort(),
        );
        for (const [key, value] of entries) {
          expect(typeof value, `${language}/${namespace}:${key}`).toBe('string');
          expect(value.trim().length, `${language}/${namespace}:${key} is empty`).toBeGreaterThan(
            0,
          );
          expect(placeholders(value).sort(), `${language}/${namespace}:${key}`).toEqual(
            placeholders(reference.get(key)).sort(),
          );
        }
      }
    }
  });

  it('stores catalogs as valid UTF-8 JSON', () => {
    const turkish = readFileSync(new URL('tr/common.json', localesDir), 'utf8');
    expect(JSON.parse(turkish).app.tagline).toContain('İlerlemen');
  });
});

describe('resolveLanguage', () => {
  it('defaults to Turkish', () => {
    expect(resolveLanguage(undefined)).toBe('tr');
    expect(resolveLanguage('')).toBe('tr');
    expect(resolveLanguage('de-DE,fr;q=0.8')).toBe('tr');
  });

  it('honours quality ordering and regional tags', () => {
    expect(resolveLanguage('en-US,en;q=0.9,tr;q=0.8')).toBe('en');
    expect(resolveLanguage('de;q=0.9,tr-TR;q=0.8,en;q=0.7')).toBe('tr');
    expect(resolveLanguage('en')).toBe('en');
  });
});
