import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  account,
  fail,
  mockApi,
  noContent,
  ok,
  renderApp,
  signedInRoutes,
} from '../../test/harness.jsx';

const stamp = { createdAt: '2026-11-24T09:00:00.000Z', updatedAt: '2026-11-24T09:00:00.000Z' };

const listItem = (overrides = {}) => ({
  id: 'entry-1',
  version: 1,
  ...stamp,
  kind: 'journal',
  title: 'Çalışma planı',
  date: '2026-11-24',
  tags: ['iş', 'plan'],
  pinned: false,
  excerpt: 'Sabah koşu, akşam kitap.',
  truncated: false,
  wordCount: 4,
  ...overrides,
});

const fullEntry = (overrides = {}) => ({
  id: 'entry-1',
  version: 1,
  ...stamp,
  kind: 'journal',
  title: 'Çalışma planı',
  body: 'Sabah **koşu**, akşam kitap.',
  date: '2026-11-24',
  tags: ['iş', 'plan'],
  pinned: false,
  ...overrides,
});

const page = (items) => ok(items, { page: 1, limit: 20, total: items.length, totalPages: 1 });

const routes = (overrides = {}) => ({
  ...signedInRoutes(),
  'GET /journal': () => page([]),
  'GET /journal/tags': () => ok([]),
  ...overrides,
});

describe('journal', () => {
  it('lists entries with previews and filters them by kind and tag', async () => {
    const items = [
      listItem({ pinned: true }),
      listItem({
        id: 'entry-2',
        kind: 'note',
        title: '',
        tags: [],
        date: '2026-11-20',
        excerpt: 'Süt, ekmek',
        truncated: true,
        wordCount: 120,
      }),
    ];
    const apiMock = mockApi(
      routes({
        'GET /journal': ({ query }) =>
          page(items.filter((item) => !query.kind || item.kind === query.kind)),
        'GET /journal/tags': () =>
          ok([
            { tag: 'iş', count: 3 },
            { tag: 'plan', count: 1 },
          ]),
      }),
    );
    renderApp('/');
    await userEvent.click(await screen.findByRole('link', { name: 'Günlük' }));

    const first = (await screen.findByRole('link', { name: 'Çalışma planı' })).closest('article');
    expect(within(first).getByText('24 Kasım Salı')).toBeInTheDocument();
    expect(within(first).getByText('4 kelime')).toBeInTheDocument();
    expect(within(first).getByText('Sabitlendi')).toBeInTheDocument();
    expect(within(first).getByText('Sabah koşu, akşam kitap.')).toBeInTheDocument();
    expect(within(first).getByText('#iş')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Çalışma planı' })).toHaveAttribute(
      'href',
      '/journal/entry-1',
    );
    const second = screen.getByRole('link', { name: 'Başlıksız' }).closest('article');
    expect(within(second).getByText('Süt, ekmek…')).toBeInTheDocument();
    expect(apiMock.calls('GET', '/journal')[0].query).toEqual({ page: '1', limit: '20' });

    await userEvent.click(screen.getByRole('radio', { name: 'Notlar' }));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Çalışma planı' })).not.toBeInTheDocument(),
    );
    expect(apiMock.calls('GET', '/journal').at(-1).query).toMatchObject({ kind: 'note' });

    await userEvent.click(screen.getByRole('button', { name: '#iş (3)' }));
    await waitFor(() =>
      expect(apiMock.calls('GET', '/journal').at(-1).query).toMatchObject({
        kind: 'note',
        tag: 'iş',
      }),
    );
    expect(screen.getByRole('button', { name: '#iş (3)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('searches as you type and explains empty results', async () => {
    const apiMock = mockApi(
      routes({
        'GET /journal': ({ query }) =>
          page(
            query.q === 'koşu'
              ? [listItem()]
              : query.q
                ? []
                : [listItem(), listItem({ id: 'entry-2', title: 'Diğer' })],
          ),
      }),
    );
    renderApp('/journal');
    const search = await screen.findByRole('searchbox', { name: 'Yazılarda ara' });
    expect(await screen.findByRole('link', { name: 'Diğer' })).toBeInTheDocument();

    await userEvent.type(search, 'koşu');
    expect(await screen.findByText('1 sonuç')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Diğer' })).not.toBeInTheDocument();
    // One request for the finished word, not one per letter.
    expect(
      apiMock.calls('GET', '/journal').filter((request) => request.query.q !== undefined),
    ).toHaveLength(1);

    await userEvent.clear(search);
    await userEvent.type(search, 'yok');
    expect(await screen.findByText('Sonuç bulunamadı')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Süzgeçleri kaldır' }));
    expect(await screen.findByRole('link', { name: 'Diğer' })).toBeInTheDocument();
    expect(search).toHaveValue('');
  });

  it('invites to write when there is nothing yet and respects hidden previews', async () => {
    mockApi(routes());
    const view = renderApp('/journal');
    expect(await screen.findByText('Henüz bir yazı yok')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Yeni yazı' })[0]).toHaveAttribute(
      'href',
      '/journal/new',
    );
    expect(screen.getByRole('link', { name: 'Yeni not' })).toHaveAttribute(
      'href',
      '/journal/new?kind=note',
    );
    view.unmount();

    const hidden = account();
    hidden.settings.privacy.hideSensitivePreviews = true;
    mockApi({
      ...signedInRoutes(hidden),
      'GET /journal': () => page([listItem({ excerpt: '', wordCount: 40 })]),
      'GET /journal/tags': () => ok([]),
    });
    renderApp('/journal');
    expect(
      await screen.findByText('Önizleme, gizlilik ayarınız nedeniyle gizlendi.'),
    ).toBeInTheDocument();
  });

  it('writes a new entry, previews its Markdown safely and saves it', async () => {
    let saved = null;
    const apiMock = mockApi(
      routes({
        'POST /journal': ({ body }) => {
          saved = fullEntry({
            id: 'entry-9',
            ...body,
            tags: body.tags.map((tag) => tag.toLowerCase()),
          });
          return ok(saved);
        },
        'GET /journal/entry-9': () => ok(saved),
      }),
    );
    renderApp('/journal/new');

    expect(await screen.findByRole('heading', { name: 'Yeni günlük yazısı' })).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Kaydet' });
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox', { name: /Başlık/ }), 'İlk gün');
    await userEvent.type(screen.getByRole('textbox', { name: /Etiketler/ }), '#iş, Sağlık iş');
    const body = '# Plan\n\nBugün **iyi** geçti.\n\n<img src=x onerror=alert(1)>';
    await userEvent.click(screen.getByRole('textbox', { name: 'Metin' }));
    await userEvent.paste(body);
    expect(screen.getByText('Kaydedilmemiş değişiklikler var')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Önizle' }));
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByText('iyi').tagName).toBe('STRONG');
    // HTML typed into the text is shown as text, never turned into elements.
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();

    await userEvent.click(save);
    expect(await screen.findByText('Kaydedildi')).toBeInTheDocument();
    const sent = apiMock.calls('POST', '/journal')[0].body;
    expect(sent).toMatchObject({
      kind: 'journal',
      title: 'İlk gün',
      body,
      tags: ['iş', 'Sağlık'],
    });
    expect(sent.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // The address now is the stored entry, and there is nothing left to save.
    expect(await screen.findByText('Tüm değişiklikler kaydedildi')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Günlük yazısı' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
  });

  it('starts a note from the note link', async () => {
    const apiMock = mockApi(
      routes({ 'POST /journal': ({ body }) => ok(fullEntry({ id: 'entry-9', ...body })) }),
    );
    renderApp('/journal/new?kind=note');
    expect(await screen.findByRole('heading', { name: 'Yeni not' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Metin' }), 'Süt al');
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(apiMock.calls('POST', '/journal')).toHaveLength(1));
    expect(apiMock.calls('POST', '/journal')[0].body).toMatchObject({
      kind: 'note',
      body: 'Süt al',
    });
  });

  it('edits an entry against its version and reloads it after a conflict', async () => {
    let stored = fullEntry();
    let conflict = false;
    const apiMock = mockApi(
      routes({
        'GET /journal/entry-1': () => ok(stored),
        'PATCH /journal/entry-1': ({ body }) => {
          if (conflict) {
            stored = fullEntry({ body: 'Telefonda yazıldı', version: 3 });
            return fail(409, 'VERSION_CONFLICT', 'Bu kayıt başka bir yerde değiştirildi.', {
              conflictingFields: ['body'],
              currentVersion: 3,
            });
          }
          stored = { ...stored, ...body, version: stored.version + 1 };
          delete stored.baseVersion;
          return ok(stored);
        },
      }),
    );
    renderApp('/journal/entry-1');

    const text = await screen.findByRole('textbox', { name: 'Metin' });
    expect(text).toHaveValue('Sabah **koşu**, akşam kitap.');
    expect(screen.getByRole('textbox', { name: /Etiketler/ })).toHaveValue('iş plan');

    await userEvent.type(text, ' Yarın yüzme.');
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(apiMock.calls('PATCH', '/journal/entry-1')).toHaveLength(1));
    expect(apiMock.calls('PATCH', '/journal/entry-1')[0].body).toMatchObject({
      body: 'Sabah **koşu**, akşam kitap. Yarın yüzme.',
      baseVersion: 1,
    });
    expect(await screen.findByText('Tüm değişiklikler kaydedildi')).toBeInTheDocument();

    conflict = true;
    await userEvent.type(screen.getByRole('textbox', { name: 'Metin' }), ' Bir şey daha.');
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(
      await screen.findByText(/Bu yazı başka bir yerde değiştirildi\. Güncel hâli yüklendi/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Metin' })).toHaveValue('Telefonda yazıldı'),
    );
  });

  it('pins an entry, restores an earlier version and deletes it', async () => {
    let stored = fullEntry({ version: 3 });
    const apiMock = mockApi(
      routes({
        'GET /journal/entry-1': () => ok(stored),
        'PATCH /journal/entry-1': ({ body }) => {
          stored = { ...stored, ...body, version: stored.version + 1 };
          return ok(stored);
        },
        'GET /journal/entry-1/revisions': () =>
          ok([
            {
              id: 'revision-2',
              entryId: 'entry-1',
              entryVersion: 2,
              title: 'Çalışma planı',
              body: 'İkinci sürüm',
              replacedAt: '2026-11-24T08:30:00.000Z',
            },
            {
              id: 'revision-1',
              entryId: 'entry-1',
              entryVersion: 1,
              title: '',
              body: '',
              replacedAt: '2026-11-24T08:00:00.000Z',
            },
          ]),
        'POST /journal/entry-1/revisions/revision-2/restore': () => {
          stored = { ...stored, body: 'İkinci sürüm', version: stored.version + 1 };
          return ok(stored);
        },
        'DELETE /journal/entry-1': () => noContent(),
      }),
    );
    renderApp('/journal/entry-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Sabitle' }));
    expect(await screen.findByRole('button', { name: 'Sabitlemeyi kaldır' })).toBeInTheDocument();
    expect(apiMock.calls('PATCH', '/journal/entry-1')[0].body).toEqual({ pinned: true });

    await userEvent.click(screen.getByRole('button', { name: 'Geçmiş' }));
    const dialog = await screen.findByRole('dialog', { name: 'Önceki sürümler' });
    const versions = await within(dialog).findAllByRole('listitem');
    expect(versions[0]).toHaveTextContent('24.11.2026 11:30 tarihine kadar geçerliydi');
    expect(versions[0]).toHaveTextContent('İkinci sürüm');
    expect(versions[1]).toHaveTextContent('Başlıksız(boş)');
    await userEvent.click(within(versions[0]).getByRole('button', { name: 'Geri yükle' }));
    expect(await screen.findByText('Önceki sürüm geri yüklendi')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Metin' })).toHaveValue('İkinci sürüm'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Sil' }));
    const confirm = await screen.findByRole('dialog', { name: 'Bu yazı silinsin mi?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Sil' }));
    expect(await screen.findByText('Yazı silindi')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Günlük' })).toBeInTheDocument();
    expect(apiMock.calls('DELETE', '/journal/entry-1')).toHaveLength(1);
  });

  it('says so when an entry does not exist', async () => {
    mockApi(routes({ 'GET /journal/entry-404': () => fail(404, 'NOT_FOUND') }));
    renderApp('/journal/entry-404');
    expect(await screen.findByText('Yazı bulunamadı')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Günlüğe dön' })).toHaveAttribute('href', '/journal');
  });
});
