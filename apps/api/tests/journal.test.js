import { afterEach, describe, expect, it, vi } from 'vitest';
import { foldText, plainText } from '../src/modules/journal/journal-entry.model.js';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const NOON = '2026-11-24T09:00:00.000Z'; // Tuesday, 12:00 in Istanbul
const TODAY = '2026-11-24';

function setNow(iso = NOON) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

describe('journal text', () => {
  it('folds case, accents and every form of the letter i', () => {
    expect(foldText('Çalışma PLANI')).toBe('calisma plani');
    expect(foldText('İSTANBUL ısı Iğdır')).toBe('istanbul isi igdir');
    expect(foldText('Café Über')).toBe('cafe uber');
  });

  it('reduces Markdown to plain words', () => {
    const markdown = [
      '# Başlık',
      '',
      '**Kalın** ve _eğik_ metin, [bağlantı](https://example.test) ile.',
      '',
      '- madde bir',
      '2. madde iki',
      '> alıntı',
      '```js',
      'const hidden = true;',
      '```',
    ].join('\n');
    expect(plainText(markdown)).toBe(
      'Başlık Kalın ve eğik metin, bağlantı ile. madde bir madde iki alıntı',
    );
  });
});

describe('journal', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  const create = async (user, body = {}) =>
    (await user.post('/journal', body).expect(201)).body.data;
  const list = async (user, query = '') => (await user.get(`/journal${query}`).expect(200)).body;
  const titles = async (user, query) => (await list(user, query)).data.map((entry) => entry.title);

  it('creates entries for today with tidy tags', async () => {
    setNow();
    const user = await registerUser();
    const entry = await create(user, {
      title: 'İlk gün',
      body: 'Bugün **iyi** geçti.',
      tags: ['#İş', 'iş', ' Sağlık '],
    });
    expect(entry).toMatchObject({
      kind: 'journal',
      title: 'İlk gün',
      body: 'Bugün **iyi** geçti.',
      date: TODAY,
      tags: ['iş', 'sağlık'],
      pinned: false,
      version: 1,
    });
    expect(entry).not.toHaveProperty('searchText');
    expect((await user.get(`/journal/${entry.id}`).expect(200)).body.data).toEqual(entry);

    const empty = await create(user, { kind: 'note' });
    expect(empty).toMatchObject({ kind: 'note', title: '', body: '', tags: [] });

    await user.post('/journal', { title: 'x'.repeat(161) }).expect(400);
    await user.post('/journal', { body: 'x'.repeat(50001) }).expect(400);
    await user.post('/journal', { tags: ['two words'] }).expect(400);
    await user
      .post('/journal', { tags: Array.from({ length: 13 }, (_, i) => `t${i}`) })
      .expect(400);
    await user.post('/journal', { date: '2026-13-01' }).expect(400);
  });

  it('lists previews instead of bodies and hides them on request', async () => {
    setNow();
    const user = await registerUser();
    const long = `# Plan\n\n${'kelime '.repeat(60)}`;
    await create(user, { title: 'Uzun', body: long });
    await create(user, { title: 'Kısa', body: 'Sadece _üç_ kelime.', date: '2026-11-20' });

    const { data, meta } = await list(user);
    expect(meta).toMatchObject({ total: 2, page: 1 });
    expect(data[0]).toMatchObject({ title: 'Uzun', truncated: true, wordCount: 61 });
    expect(data[0].excerpt).toHaveLength(240);
    expect(data[0].excerpt.startsWith('Plan kelime kelime')).toBe(true);
    expect(data[1]).toMatchObject({
      title: 'Kısa',
      excerpt: 'Sadece üç kelime.',
      truncated: false,
      wordCount: 3,
    });
    expect(data[0]).not.toHaveProperty('body');
    expect(data[0]).not.toHaveProperty('searchText');

    const settings = (await user.get('/settings').expect(200)).body.data;
    await user
      .patch('/settings', {
        privacy: { hideSensitivePreviews: true },
        baseVersion: settings.version,
      })
      .expect(200);
    const hidden = (await list(user)).data;
    expect(hidden.map((entry) => [entry.excerpt, entry.truncated])).toEqual([
      ['', false],
      ['', false],
    ]);
    expect(hidden[0].wordCount).toBe(61);
  });

  it('finds entries by words, ignoring case and accents', async () => {
    setNow();
    const user = await registerUser();
    await create(user, { title: 'Çalışma planı', body: 'Sabah **koşu**, akşam kitap.' });
    await create(user, { title: 'Istanbul gezisi', body: 'Kahve ve yürüyüş.', tags: ['gezi'] });
    await create(user, { title: 'Alışveriş', body: 'Süt, ekmek (2 adet).', kind: 'note' });

    expect(await titles(user, '?q=calisma')).toEqual(['Çalışma planı']);
    expect(await titles(user, '?q=ÇALIŞMA')).toEqual(['Çalışma planı']);
    expect(await titles(user, `?q=${encodeURIComponent('İSTANBUL')}`)).toEqual(['Istanbul gezisi']);
    expect(await titles(user, `?q=${encodeURIComponent('koşu kitap')}`)).toEqual(['Çalışma planı']);
    expect(await titles(user, `?q=${encodeURIComponent('koşu kahve')}`)).toEqual([]);
    // Words are matched inside the text, and tags are searched too.
    expect(await titles(user, '?q=yuru')).toEqual(['Istanbul gezisi']);
    expect(await titles(user, '?q=gezi')).toEqual(['Istanbul gezisi']);
    // Characters that mean something in a pattern are taken literally.
    expect(await titles(user, `?q=${encodeURIComponent('(2')}`)).toEqual(['Alışveriş']);
    expect(await titles(user, `?q=${encodeURIComponent('.*')}`)).toEqual([]);
    expect(await titles(user, '?q=calisma&kind=note')).toEqual([]);
  });

  it('filters by kind, tag and day, and puts pinned entries first', async () => {
    setNow();
    const user = await registerUser();
    await create(user, { title: 'Pazartesi', date: '2026-11-23', tags: ['iş'] });
    await create(user, { title: 'Salı', date: TODAY, tags: ['iş', 'spor'] });
    const idea = await create(user, { title: 'Fikir', kind: 'note', date: '2026-11-01' });

    expect(await titles(user, '')).toEqual(['Salı', 'Pazartesi', 'Fikir']);
    await user.patch(`/journal/${idea.id}`, { pinned: true }).expect(200);
    expect(await titles(user, '')).toEqual(['Fikir', 'Salı', 'Pazartesi']);
    expect(await titles(user, '?pinned=true')).toEqual(['Fikir']);
    expect(await titles(user, '?kind=journal')).toEqual(['Salı', 'Pazartesi']);
    expect(await titles(user, `?tag=${encodeURIComponent('#İŞ')}`)).toEqual(['Salı', 'Pazartesi']);
    expect(await titles(user, '?tag=spor')).toEqual(['Salı']);
    expect(await titles(user, '?from=2026-11-23&to=2026-11-23')).toEqual(['Pazartesi']);
    expect(await titles(user, '?limit=1&page=2')).toEqual(['Salı']);
    await user.get('/journal?from=2026-11-24&to=2026-11-23').expect(400);

    expect((await user.get('/journal/tags').expect(200)).body.data).toEqual([
      { tag: 'iş', count: 2 },
      { tag: 'spor', count: 1 },
    ]);
  });

  it('keeps earlier contents as revisions and restores them', async () => {
    setNow();
    const user = await registerUser();
    const entry = await create(user, { title: 'Taslak', body: 'Birinci sürüm' });
    const revisionsOf = async () =>
      (await user.get(`/journal/${entry.id}/revisions`).expect(200)).body.data;
    expect(await revisionsOf()).toEqual([]);

    // Changing tags or pinning is not a new content.
    await user.patch(`/journal/${entry.id}`, { tags: ['a'], pinned: true }).expect(200);
    expect(await revisionsOf()).toEqual([]);

    vi.setSystemTime(new Date('2026-11-24T09:01:00.000Z'));
    await user.patch(`/journal/${entry.id}`, { body: 'İkinci sürüm' }).expect(200);
    vi.setSystemTime(new Date('2026-11-24T09:02:00.000Z'));
    const third = (
      await user.patch(`/journal/${entry.id}`, { title: 'Son', body: 'Üçüncü sürüm' }).expect(200)
    ).body.data;
    // Saving the same text again changes nothing and records nothing.
    await user.patch(`/journal/${entry.id}`, { body: 'Üçüncü sürüm' }).expect(200);

    const revisions = await revisionsOf();
    expect(revisions).toMatchObject([
      {
        entryId: entry.id,
        entryVersion: 3,
        title: 'Taslak',
        body: 'İkinci sürüm',
        replacedAt: '2026-11-24T09:02:00.000Z',
      },
      { entryVersion: 2, title: 'Taslak', body: 'Birinci sürüm' },
    ]);

    vi.setSystemTime(new Date('2026-11-24T09:03:00.000Z'));
    const restored = (
      await user.post(`/journal/${entry.id}/revisions/${revisions[1].id}/restore`).expect(200)
    ).body.data;
    expect(restored).toMatchObject({
      title: 'Taslak',
      body: 'Birinci sürüm',
      tags: ['a'],
      pinned: true,
      version: third.version + 1,
    });
    // What was replaced by the restore can itself be brought back.
    expect((await revisionsOf())[0]).toMatchObject({ title: 'Son', body: 'Üçüncü sürüm' });
    // The search follows the current text only.
    expect(await titles(user, `?q=${encodeURIComponent('üçüncü')}`)).toEqual([]);
    expect(await titles(user, '?q=birinci')).toEqual(['Taslak']);

    await user
      .post(`/journal/${entry.id}/revisions/7b0c1f0e-6f0e-4d8b-9a55-3f0a6c1d2e3f/restore`)
      .expect(404);
  });

  it('keeps a bounded history and removes it with the entry', async () => {
    setNow();
    const user = await registerUser();
    const entry = await create(user, { body: 'sürüm 0' });
    for (let index = 1; index <= 23; index += 1) {
      vi.setSystemTime(new Date(Date.parse(NOON) + index * 1000));
      await user.patch(`/journal/${entry.id}`, { body: `sürüm ${index}` }).expect(200);
    }
    const revisions = (await user.get(`/journal/${entry.id}/revisions`).expect(200)).body.data;
    expect(revisions).toHaveLength(20);
    expect(revisions[0].body).toBe('sürüm 22');
    expect(revisions.at(-1).body).toBe('sürüm 3');

    const exported = (await user.get('/account/export').expect(200)).body.data.data;
    expect(exported.journalEntry).toMatchObject([{ id: entry.id, body: 'sürüm 23' }]);
    expect(exported.journalRevisions).toHaveLength(20);

    await user.delete(`/journal/${entry.id}`).expect(204);
    await user.get(`/journal/${entry.id}`).expect(404);
    await user.get(`/journal/${entry.id}/revisions`).expect(404);
    const afterDelete = (await user.get('/account/export').expect(200)).body.data.data;
    expect(afterDelete.journalRevisions).toEqual([]);
  });

  it('merges edits of different fields and refuses conflicting ones', async () => {
    setNow();
    const user = await registerUser();
    const entry = await create(user, { title: 'Başlık', body: 'Metin' });

    await user.patch(`/journal/${entry.id}`, { body: 'Telefonda', baseVersion: 1 }).expect(200);
    // Another device still has version 1: its title change does not touch the body.
    const merged = (
      await user.patch(`/journal/${entry.id}`, { title: 'Yeni başlık', baseVersion: 1 }).expect(200)
    ).body.data;
    expect(merged).toMatchObject({ title: 'Yeni başlık', body: 'Telefonda', version: 3 });

    const conflict = (
      await user.patch(`/journal/${entry.id}`, { body: 'Bilgisayarda', baseVersion: 1 }).expect(409)
    ).body.error;
    expect(conflict).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { conflictingFields: ['body'], currentVersion: 3 },
    });
    expect(conflict.details.current.body).toBe('Telefonda');
  });

  it('keeps every account’s entries to itself', async () => {
    setNow();
    const user = await registerUser();
    const other = await registerUser();
    const entry = await create(user, { title: 'Gizli', body: 'Kimse görmesin', tags: ['özel'] });
    await user.patch(`/journal/${entry.id}`, { body: 'Hâlâ gizli' }).expect(200);

    await other.get(`/journal/${entry.id}`).expect(404);
    await other.patch(`/journal/${entry.id}`, { body: 'x' }).expect(404);
    await other.delete(`/journal/${entry.id}`).expect(404);
    await other.get(`/journal/${entry.id}/revisions`).expect(404);
    expect((await list(other)).data).toEqual([]);
    expect((await list(other, '?q=gizli')).data).toEqual([]);
    expect((await other.get('/journal/tags').expect(200)).body.data).toEqual([]);
    const exported = (await other.get('/account/export').expect(200)).body.data.data;
    expect(exported.journalEntry).toEqual([]);
    expect(exported.journalRevisions).toEqual([]);
  });
});
