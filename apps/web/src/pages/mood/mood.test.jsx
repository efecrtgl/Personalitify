import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, mockApi, noContent, ok, renderApp, signedInRoutes } from '../../test/harness.jsx';

const TODAY = '2026-11-24';

const entry = (date, score, overrides = {}) => ({
  id: `mood-${date}`,
  version: 1,
  createdAt: `${date}T09:00:00.000Z`,
  updatedAt: `${date}T09:00:00.000Z`,
  date,
  score,
  emotions: [],
  note: '',
  ...overrides,
});

function summaryOf(entries) {
  const average = (list) =>
    list.length === 0
      ? null
      : Math.round((list.reduce((sum, item) => sum + item.score, 0) / list.length) * 100) / 100;
  const weekdayOf = (date) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const emotions = new Map();
  for (const item of entries) {
    for (const emotion of item.emotions) emotions.set(emotion, (emotions.get(emotion) ?? 0) + 1);
  }
  return {
    count: entries.length,
    average: average(entries),
    distribution: [1, 2, 3, 4, 5].map((score) => ({
      score,
      count: entries.filter((item) => item.score === score).length,
    })),
    emotions: [...emotions].map(([emotion, count]) => ({ emotion, count })),
    byWeekday: Array.from({ length: 7 }, (_, index) => {
      const matching = entries.filter((item) => weekdayOf(item.date) === index + 1);
      return { weekday: index + 1, count: matching.length, average: average(matching) };
    }),
  };
}

/** A stateful mood API over `entries`. */
function moodRoutes(entries = []) {
  let stored = [...entries];
  return {
    ...signedInRoutes(),
    'GET /mood': ({ query }) => {
      const inRange = stored.filter((item) => item.date >= query.from && item.date <= query.to);
      return ok({
        from: query.from,
        to: query.to,
        today: TODAY,
        entries: inRange,
        summary: summaryOf(inRange),
      });
    },
    [`PUT /mood/${TODAY}`]: ({ body }) => {
      const saved = entry(TODAY, body.score, { emotions: body.emotions, note: body.note });
      stored = [...stored.filter((item) => item.date !== TODAY), saved];
      return ok(saved);
    },
    'PUT /mood/2026-11-10': ({ body }) => {
      const saved = entry('2026-11-10', body.score, { emotions: body.emotions, note: body.note });
      stored = [...stored.filter((item) => item.date !== '2026-11-10'), saved];
      return ok(saved);
    },
    [`DELETE /mood/${TODAY}`]: () => {
      stored = stored.filter((item) => item.date !== TODAY);
      return noContent();
    },
  };
}

describe('mood', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T09:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('records today with a score, feelings and a note', async () => {
    const apiMock = mockApi(moodRoutes());
    renderApp('/');
    await userEvent.click(await screen.findByRole('link', { name: 'Ruh hali' }));

    expect(await screen.findByRole('heading', { name: 'Bugün nasılsınız?' })).toBeInTheDocument();
    expect(apiMock.calls('GET', '/mood')[0].query).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(screen.getByText('Seçili ayda kayıt yok.')).toBeInTheDocument();

    // A score is required; nothing is sent without one.
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Önce bir ruh hali seçin.');
    expect(apiMock.calls('PUT', `/mood/${TODAY}`)).toHaveLength(0);

    await userEvent.click(screen.getByRole('radio', { name: 'İyi' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sakin' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Minnettar' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Not/ }), 'Sakin bir gün ');
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Ruh hali kaydedildi')).toBeInTheDocument();
    expect(apiMock.calls('PUT', `/mood/${TODAY}`)[0].body).toEqual({
      score: 4,
      emotions: ['calm', 'grateful'],
      note: 'Sakin bir gün',
    });
    // The saved day shows up in the calendar and in the summary.
    expect(await screen.findByRole('button', { name: '24 Kasım Salı: İyi' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByText('5 üzerinden 4').length).toBeGreaterThan(0);
    expect(screen.getByText('1 gün kaydedildi')).toBeInTheDocument();
  });

  it('shows an existing entry and removes it', async () => {
    const apiMock = mockApi(
      moodRoutes([entry(TODAY, 2, { emotions: ['tired'], note: 'Uykusuz' })]),
    );
    renderApp('/mood');

    expect(await screen.findByRole('radio', { name: 'Kötü' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Yorgun' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: /Not/ })).toHaveValue('Uykusuz');

    await userEvent.click(screen.getByRole('button', { name: 'Kaydı sil' }));
    expect(await screen.findByText('Kayıt silindi')).toBeInTheDocument();
    expect(apiMock.calls('DELETE', `/mood/${TODAY}`)).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Kötü' })).not.toBeChecked());
    expect(screen.queryByRole('button', { name: 'Kaydı sil' })).not.toBeInTheDocument();
  });

  it('summarizes the month and gives the chart as a table', async () => {
    mockApi(
      moodRoutes([
        entry('2026-11-16', 2, { emotions: ['tired', 'stressed'] }),
        entry('2026-11-17', 4, { emotions: ['calm'] }),
        entry('2026-11-23', 5, { emotions: ['calm', 'happy'] }),
        entry(TODAY, 4, { emotions: ['calm'] }),
      ]),
    );
    renderApp('/mood');

    const summary = (await screen.findByRole('heading', { name: 'Özet' })).closest('section');
    expect(within(summary).getByText('5 üzerinden 3,75')).toBeInTheDocument();
    expect(within(summary).getByText('4 gün kaydedildi')).toBeInTheDocument();
    expect(within(summary).getByRole('progressbar', { name: 'İyi: 2 gün' })).toBeInTheDocument();
    expect(
      within(summary).getByRole('progressbar', { name: 'Çok kötü: 0 gün' }),
    ).toBeInTheDocument();
    expect(within(summary).getByText('Sakin · 3')).toBeInTheDocument();
    const rows = within(within(summary).getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Pazartesi5 üzerinden 3,52 kayıt');
    expect(rows[2]).toHaveTextContent('Salı5 üzerinden 42 kayıt');
    expect(rows[3]).toHaveTextContent('ÇarşambaKayıt yok0 kayıt');

    // The calendar names every day; days that have not come yet cannot be chosen.
    expect(screen.getByRole('button', { name: '23 Kasım Pazartesi: Çok iyi' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '25 Kasım Çarşamba: kayıt yok' })).toBeDisabled();
  });

  it('edits another day and moves between months', async () => {
    const apiMock = mockApi(moodRoutes([entry('2026-10-05', 3)]));
    renderApp('/mood');

    await userEvent.click(await screen.findByRole('button', { name: '10 Kasım Salı: kayıt yok' }));
    expect(screen.getByRole('heading', { name: '10 Kasım Salı nasıldı?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Çok iyi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(apiMock.calls('PUT', '/mood/2026-11-10')).toHaveLength(1));
    expect(apiMock.calls('PUT', '/mood/2026-11-10')[0].body).toMatchObject({ score: 5 });

    // There is no month after the current one.
    expect(screen.getByRole('button', { name: 'Sonraki ay' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Önceki ay' }));
    expect(await screen.findByRole('heading', { name: 'Ekim 2026' })).toBeInTheDocument();
    expect(apiMock.calls('GET', '/mood').at(-1).query).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(
      await screen.findByRole('button', { name: '5 Ekim Pazartesi: Orta' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sonraki ay' }));
    expect(await screen.findByRole('heading', { name: 'Bugün nasılsınız?' })).toBeInTheDocument();
  });

  it('offers a retry when the month cannot be loaded', async () => {
    let failing = true;
    const routes = moodRoutes();
    mockApi({
      ...routes,
      'GET /mood': (request) =>
        failing ? fail(500, 'INTERNAL_ERROR') : routes['GET /mood'](request),
    });
    renderApp('/mood');
    const retry = await screen.findByRole('button', { name: 'Yeniden dene' });
    failing = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('heading', { name: 'Bugün nasılsınız?' })).toBeInTheDocument();
  });
});
