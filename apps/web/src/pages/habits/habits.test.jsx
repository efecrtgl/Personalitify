import { ITEM_ICONS } from '@personalitify/shared-contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFormatters } from '../../lib/format.js';
import { i18n } from '../../lib/i18n.js';
import { itemIcon, knownIconNames } from '../../lib/icons.js';
import { account, fail, mockApi, ok, renderApp, signedInRoutes } from '../../test/harness.jsx';
import { describeSchedule } from './habitText.js';

const TODAY = '2026-11-24';

function habit(overrides = {}) {
  return {
    id: 'habit-1',
    version: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    name: 'Kitap oku',
    description: '',
    categoryId: null,
    color: '#0a84ff',
    icon: 'book',
    startDate: '2026-11-01',
    endDate: null,
    reminders: [],
    streakGoal: null,
    archived: false,
    archivedAt: null,
    sortOrder: 0,
    ...overrides,
    schedule: {
      mode: 'fixed',
      recurrence: { frequency: 'daily', interval: 1, weekdays: [], monthDays: [] },
      period: 'week',
      timesPerPeriod: 1,
      ...overrides.schedule,
    },
    target: { kind: 'check', value: 1, unit: '', ...overrides.target },
  };
}

function dayItem(definition, overrides = {}) {
  return {
    habitId: definition.id,
    date: TODAY,
    state: 'pending',
    due: true,
    value: 0,
    target: definition.target.value,
    progress: 0,
    entry: null,
    period: null,
    streak: { current: 0, best: 0, unit: 'days' },
    habit: definition,
    ...overrides,
  };
}

const dayOf = (items, date = TODAY) => {
  const due = items.filter((item) => item.due);
  const completed = due.filter((item) => item.state === 'completed').length;
  return {
    date,
    today: TODAY,
    items,
    summary: {
      due: due.length,
      completed,
      skipped: 0,
      postponed: 0,
      rate: due.length ? completed / due.length : null,
    },
  };
};

describe('habits day view', () => {
  it('shows the day, completes a habit at once and keeps the server’s streak', async () => {
    const user = userEvent.setup();
    const reading = habit();
    const water = habit({
      id: 'habit-2',
      name: 'Su iç',
      icon: 'droplet',
      target: { kind: 'count', value: 8, unit: 'bardak' },
    });
    const api = mockApi({
      ...signedInRoutes(),
      'GET /habits/day': () =>
        ok(
          dayOf([
            dayItem(reading),
            dayItem(water, { value: 3, progress: 3 / 8, state: 'partial' }),
          ]),
        ),
      'PUT /habits/habit-1/entries/2026-11-24': () =>
        ok(
          dayItem(reading, {
            state: 'completed',
            value: 1,
            progress: 1,
            streak: { current: 5, best: 5, unit: 'days' },
          }),
        ),
      'GET /categories': () => ok([]),
    });
    renderApp('/habits');

    expect(await screen.findByRole('heading', { name: 'Bugün' })).toBeInTheDocument();
    expect(await screen.findByText('24 Kasım 2026')).toBeInTheDocument();
    expect(screen.getByText('2 alışkanlıktan 0 tanesi tamamlandı')).toBeInTheDocument();
    expect(screen.getByText('3 / 8 bardak')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', {
      name: 'Kitap oku alışkanlığını tamamlandı olarak işaretle',
    });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    // Checked immediately, before the server has answered.
    expect(checkbox).toBeChecked();
    await waitFor(() =>
      expect(api.calls('PUT', '/habits/habit-1/entries/2026-11-24')).toHaveLength(1),
    );
    expect(api.calls('PUT', '/habits/habit-1/entries/2026-11-24')[0].body).toEqual({ value: 1 });
    expect(await screen.findByText('5 gün')).toBeInTheDocument();
  });

  it('sends increments for count habits and rolls back when the server refuses', async () => {
    const user = userEvent.setup();
    const water = habit({ name: 'Su iç', target: { kind: 'count', value: 8, unit: 'bardak' } });
    const api = mockApi({
      ...signedInRoutes(),
      'GET /habits/day': () => ok(dayOf([dayItem(water, { value: 3, progress: 3 / 8 })])),
      'PUT /habits/habit-1/entries/2026-11-24': () =>
        fail(500, 'INTERNAL_ERROR', 'Bizden kaynaklanan bir sorun oluştu.'),
      'GET /categories': () => ok([]),
    });
    renderApp('/habits');

    await user.click(await screen.findByRole('button', { name: 'Su iç değerini artır' }));
    await waitFor(() =>
      expect(api.calls('PUT', '/habits/habit-1/entries/2026-11-24')[0].body).toEqual({
        increment: 1,
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Bizden kaynaklanan');
    expect(await screen.findByText('3 / 8 bardak')).toBeInTheDocument();
  });

  it('skips a day from the habit’s menu', async () => {
    const user = userEvent.setup();
    const reading = habit();
    const api = mockApi({
      ...signedInRoutes(),
      'GET /habits/day': () => ok(dayOf([dayItem(reading)])),
      'PUT /habits/habit-1/entries/2026-11-24': () => ok(dayItem(reading, { state: 'skipped' })),
      'GET /categories': () => ok([]),
    });
    renderApp('/habits');

    await user.click(await screen.findByRole('button', { name: 'Kitap oku için diğer işlemler' }));
    await user.click(screen.getByRole('menuitem', { name: 'Bu günü atla' }));

    expect(await screen.findByText('Atlandı')).toBeInTheDocument();
    expect(api.calls('PUT', '/habits/habit-1/entries/2026-11-24')[0].body).toEqual({
      status: 'skipped',
    });
    // A skipped habit has nothing to complete.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('moves between days by asking the server for each date', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...signedInRoutes(),
      'GET /habits/day': ({ query }) => ok(dayOf([], query.date ?? TODAY)),
      'GET /categories': () => ok([]),
    });
    renderApp('/habits');
    await screen.findByRole('heading', { name: 'Bugün' });
    expect(await screen.findByText('Bu gün için planlanan bir şey yok')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Önceki gün' }));
    expect(await screen.findByRole('heading', { name: 'Dün' })).toBeInTheDocument();
    expect(api.calls('GET', '/habits/day').at(-1).query).toEqual({ date: '2026-11-23' });

    await user.click(screen.getByRole('button', { name: 'Bugün' }));
    expect(await screen.findByRole('heading', { name: 'Bugün' })).toBeInTheDocument();
  });
});

describe('habit form', () => {
  it('validates and creates a habit with the chosen schedule and target', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...signedInRoutes(),
      'GET /habits/day': () => ok(dayOf([])),
      'GET /categories': () => ok([]),
      'POST /habits': ({ body }) => ok(habit({ ...body, id: 'new-habit' })),
    });
    renderApp('/habits');

    await user.click((await screen.findAllByRole('button', { name: 'Yeni alışkanlık' }))[0]);
    const dialog = screen.getByRole('dialog', { name: 'Yeni alışkanlık' });
    await user.click(within(dialog).getByRole('button', { name: 'Alışkanlık oluştur' }));
    expect(within(dialog).getByText('Bu alan zorunludur.')).toBeInTheDocument();
    expect(api.calls('POST', '/habits')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText('Ad'), 'Koşu');
    await user.click(within(dialog).getByRole('radio', { name: 'Yeşil' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Ayak izi' }));
    await user.selectOptions(within(dialog).getByLabelText('Tekrar'), 'weekdays');
    // Monday to Friday are preselected; drop Tuesday and Thursday.
    await user.click(within(dialog).getByRole('checkbox', { name: 'Salı' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Perşembe' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Belirli bir süre' }));
    const minutes = within(dialog).getByLabelText('Günde kaç dakika');
    await user.clear(minutes);
    await user.type(minutes, '30');
    await user.click(within(dialog).getByRole('button', { name: 'Hatırlatıcı ekle' }));
    await user.click(within(dialog).getByRole('button', { name: 'Alışkanlık oluştur' }));

    await waitFor(() => expect(api.calls('POST', '/habits')).toHaveLength(1));
    expect(api.calls('POST', '/habits')[0].body).toEqual({
      name: 'Koşu',
      description: '',
      icon: 'footprints',
      color: '#30d158',
      categoryId: null,
      schedule: {
        mode: 'fixed',
        recurrence: { frequency: 'weekly', interval: 1, weekdays: [1, 3, 5], monthDays: [] },
        period: 'week',
        timesPerPeriod: 3,
      },
      target: { kind: 'duration', value: 30, unit: '' },
      startDate: TODAY,
      endDate: null,
      reminders: [{ time: '09:00', enabled: true }],
      streakGoal: null,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Alışkanlık oluşturuldu')).toBeInTheDocument();
  });

  it('edits a habit with its version and shows field errors from the server', async () => {
    const user = userEvent.setup();
    const reading = habit({ version: 3 });
    const api = mockApi({
      ...signedInRoutes(),
      'GET /habits': () => ok([reading]),
      'GET /categories': () =>
        ok([
          {
            id: 'cat-1',
            version: 1,
            name: 'Sağlık',
            color: '#30d158',
            icon: 'heart',
            sortOrder: 0,
          },
        ]),
      'PATCH /habits/habit-1': () =>
        fail(400, 'VALIDATION_FAILED', 'Geçersiz', [
          {
            path: 'endDate',
            code: 'end_before_start',
            message: 'Bitiş, başlangıçtan önce olamaz.',
          },
        ]),
    });
    renderApp('/habits/all');

    await user.click(await screen.findByRole('button', { name: 'Kitap oku için diğer işlemler' }));
    await user.click(screen.getByRole('menuitem', { name: 'Düzenle' }));
    const dialog = screen.getByRole('dialog', { name: 'Alışkanlığı düzenle' });
    expect(within(dialog).getByLabelText('Ad')).toHaveValue('Kitap oku');
    await user.selectOptions(await within(dialog).findByLabelText('Kategori'), 'cat-1');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    expect(await within(dialog).findByText('Bitiş, başlangıçtan önce olamaz.')).toBeInTheDocument();
    const [request] = api.calls('PATCH', '/habits/habit-1');
    expect(request.body).toMatchObject({ baseVersion: 3, categoryId: 'cat-1', name: 'Kitap oku' });
  });
});

describe('habit detail', () => {
  it('explains every figure it shows', async () => {
    const reading = habit({ streakGoal: 30 });
    mockApi({
      ...signedInRoutes(account()),
      'GET /habits/habit-1': () => ok(reading),
      'GET /habits/habit-1/stats': () =>
        ok({
          habitId: 'habit-1',
          today: TODAY,
          streak: { current: 12, best: 20, unit: 'days' },
          streakGoal: 30,
          totalCompletions: 48,
          totalValue: 48,
          windows: [7, 30, 90].map((days) => ({
            days,
            due: 20,
            completed: 15,
            missed: 5,
            skipped: 1,
            postponed: 0,
            extra: 0,
            rate: 0.75,
          })),
          byWeekday: Array.from({ length: 7 }, (_, index) => ({
            weekday: index + 1,
            due: 4,
            completed: 3,
          })),
          unit: 'days',
        }),
      'GET /habits/habit-1/history': ({ query }) =>
        ok({
          habitId: 'habit-1',
          from: query.from,
          to: query.to,
          today: TODAY,
          days: Array.from({ length: 112 }, (_, index) => ({
            date: new Date(Date.parse(`${query.from}T00:00:00Z`) + index * 86_400_000)
              .toISOString()
              .slice(0, 10),
            state: index % 5 === 0 ? 'missed' : 'completed',
            due: true,
            value: 1,
            target: 1,
            note: index === 100 ? 'Yeni kitaba başladım' : '',
            entryId: null,
          })),
        }),
      'GET /categories': () => ok([]),
    });
    renderApp('/habits/habit-1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Kitap oku' })).toBeInTheDocument();
    expect(await screen.findByText('12 gün')).toBeInTheDocument();
    expect(screen.getByText('20 gün')).toBeInTheDocument();
    expect(screen.getByText('Hedefiniz: art arda 30')).toBeInTheDocument();
    expect(screen.getByText('%75')).toBeInTheDocument();
    expect(screen.getByText(/20 gün içinden 15 tanesi tamamlandı/)).toBeInTheDocument();
    expect(screen.getByText(/Atlanan ve ertelenen günler seriyi bozmaz/)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Son 16 haftanın geçmişi/ })).toBeInTheDocument();
    expect(await screen.findByText('Yeni kitaba başladım')).toBeInTheDocument();
  });

  it('says so when the habit does not exist', async () => {
    mockApi({
      ...signedInRoutes(),
      'GET /habits/missing': () => fail(404, 'NOT_FOUND', 'İstenen kayıt bulunamadı.'),
      'GET /habits/missing/stats': () => fail(404, 'NOT_FOUND', 'İstenen kayıt bulunamadı.'),
    });
    renderApp('/habits/missing');
    expect(await screen.findByText('Bu alışkanlık mevcut değil')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).not.toBeInTheDocument();
  });
});

describe('habit presentation helpers', () => {
  it('has an icon for every icon name of the platform', () => {
    for (const name of ITEM_ICONS) {
      expect(knownIconNames, name).toContain(name);
      expect(itemIcon(name), name).toBeDefined();
    }
  });

  it('describes schedules in both languages', async () => {
    const schedule = (recurrence, extra = {}) => ({
      mode: 'fixed',
      period: 'week',
      timesPerPeriod: 1,
      ...extra,
      recurrence: { frequency: 'daily', interval: 1, weekdays: [], monthDays: [], ...recurrence },
    });
    const cases = [
      [schedule({}), 'Her gün', 'Every day'],
      [schedule({ interval: 3 }), '3 günde bir', 'Every 3 days'],
      [schedule({ frequency: 'weekly', weekdays: [5, 1, 3] }), 'Pzt, Çar, Cum', 'Mon, Wed, Fri'],
      [
        schedule({ frequency: 'weekly', interval: 2, weekdays: [6] }),
        '2 haftada bir: Cmt',
        'Every 2 weeks on Sat',
      ],
      [
        schedule({ frequency: 'monthly', monthDays: [15, 1, -1] }),
        'Her ayın 1, 15, son. günü',
        'Monthly on day 1, 15, last',
      ],
      [schedule({}, { mode: 'flexible', timesPerPeriod: 3 }), 'Haftada 3 kez', '3 times a week'],
      [
        schedule({}, { mode: 'flexible', period: 'month', timesPerPeriod: 1 }),
        'Ayda bir kez',
        'Once a month',
      ],
    ];
    for (const [value, turkish, english] of cases) {
      await i18n.changeLanguage('tr');
      expect(describeSchedule(i18n.t, createFormatters({ locale: 'tr-TR' }), value)).toBe(turkish);
      await i18n.changeLanguage('en');
      expect(describeSchedule(i18n.t, createFormatters({ locale: 'en-US' }), value)).toBe(english);
    }
  });
});
