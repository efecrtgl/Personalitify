import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_LANGUAGES, resources } from '@personalitify/localization';
import { describe, expect, it } from 'vitest';

const sourceRoot = dirname(fileURLToPath(import.meta.url));

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path);
    return /\.(js|jsx)$/.test(name) && !/\.test\.jsx?$/.test(name) ? [path] : [];
  });
}

function lookup(language, key) {
  const [namespace, path] = key.split(':');
  let node = resources[language][namespace];
  for (const segment of path.split('.')) {
    node = node?.[segment];
  }
  return node;
}

/** A key exists when it has a message, or plural forms of one. */
function exists(language, key) {
  return (
    typeof lookup(language, key) === 'string' ||
    typeof lookup(language, `${key}_other`) === 'string'
  );
}

const files = sourceFiles(sourceRoot);
const sources = files.map((path) => ({
  file: relative(sourceRoot, path).replaceAll('\\', '/'),
  text: readFileSync(path, 'utf8'),
}));

describe('translations used by the web client', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has a Turkish and an English message for every literal key in the source', () => {
    const literal = /['"]((?:common|auth|home|settings|errors):[A-Za-z0-9_.]+)['"]/g;
    const missing = [];
    let checked = 0;
    for (const { file, text } of sources) {
      for (const [, key] of text.matchAll(literal)) {
        checked += 1;
        for (const language of SUPPORTED_LANGUAGES) {
          if (!exists(language, key)) missing.push(`${file}: ${key} (${language})`);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });

  it('has a message group for every key that is built at run time', () => {
    // Keys such as t(`settings:sections.${id}`) cannot be checked one by one, but the group
    // they select from must exist in both languages.
    const dynamic = /`((?:common|auth|home|settings|errors):[A-Za-z0-9_.]*)\$\{/g;
    const missing = [];
    for (const { file, text } of sources) {
      for (const [, prefix] of text.matchAll(dynamic)) {
        const group = prefix.replace(/[._]$/, '');
        for (const language of SUPPORTED_LANGUAGES) {
          const node = group.endsWith(':')
            ? resources[language][group.slice(0, -1)]
            : lookup(language, group);
          const partialName = prefix.endsWith('_') || !/[.:]$/.test(prefix);
          if (node === undefined && !partialName) missing.push(`${file}: ${prefix}* (${language})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('contains no hardcoded sentences in JSX', () => {
    // Text between tags must come from the catalogs. Punctuation, symbols and single
    // characters used as separators are allowed.
    const jsxText = />\s*([A-Za-zÇĞİÖŞÜçğıöşü][^<>{}]*[A-Za-zÇĞİÖŞÜçğıöşü.!?])\s*</g;
    const offenders = [];
    for (const { file, text } of sources) {
      if (!file.endsWith('.jsx')) continue;
      const withoutComments = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const [, phrase] of withoutComments.matchAll(jsxText)) {
        if (/[=;()]|=>/.test(phrase)) continue; // code between a comparison and a tag
        offenders.push(`${file}: "${phrase.trim()}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
