import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toCsv } from '../../lib/download.js';
import { fail, mockApi, ok, renderApp, signedInRoutes } from '../../test/harness.jsx';

const TODAY = '2026-11-24';
const pad = (value) => String(value).padStart(2, '0');

/** A month of analytics; `overrides` replace whole top-level parts. */
function overview(overrides = {}) {
  const series = Array.from({ length: 30 }, (_, index) => {
    const date = `2026-11-${pad(index + 1)}`;
    const past = index + 1 < 24;
    return {
      from: date,
      to: date,
      habits: past
        ? { due: 2, completed: index === 4 ? 1 : 2, rate: index === 4 ? 0.5 : 1 }
        : { due: 0, completed: 0, rate: null },
      tasks: { completed: index === 11 ? 3 : 0 },
    };
  });
  return {
    period: 'month',
    bucket: 'day',
    range: { from: '2026-11-01', to: '2026-11-30' },
    previousRange: { from: '2026-10-01', to: '2026-10-31' },
    today: TODAY,
    timeZone: 'Europe/Istanbul',
    weekStart: 1,
    complete: false,
    series,
    habits: {
      due: 46,
      completed: 45,
      missed: 1,
      rate: 45 / 46,
      previous: { due: 40, completed: 30, rate: 0.75 },
      byWeekday: Array.from({ length: 7 }, (_, index) => ({
        weekday: index + 1,
        due: index === 6 ? 0 : 6,
        completed: index === 3 ? 5 : index === 6 ? 0 : 6,
        rate: index === 6 ? null : index === 3 ? 5 / 6 : 1,
      })),
      items: [
        {
          habitId: 'habit-1',
          name: 'Kitap oku',
          color: '#5e5ce6',
          icon: 'book',
          archived: false,
          unit: 'days',
          due: 23,
          completed: 23,
          missed: 0,
          skipped: 0,
          rate: 1,
          previousRate: 0.8,
        },
        {
          habitId: 'habit-2',
          name: 'Spor',
          color: '#30d158',
          icon: 'dumbbell',
          archived: true,
          unit: 'weeks',
          due: 3,
          completed: 2,
          missed: 1,
          skipped: 0,
          rate: 2 / 3,
          previousRate: null,
        },
      ],
    },
    tasks: {
      completed: 8,
      due: 6,
      dueCompleted: 5,
      onTime: 4,
      late: 1,
      withoutDueDate: 3,
      onTimeRate: 0.8,
      overdueOpen: 2,
      previous: { completed: 5 },
      byPriority: [
        { priority: 'none', completed: 5 },
        { priority: 'low', completed: 0 },
        { priority: 'medium', completed: 1 },
        { priority: 'high', completed: 2 },
      ],
      byCategory: [
        { categoryId: 'category-1', name: 'İş', color: '#0a84ff', completed: 6 },
        { categoryId: null, name: null, color: null, completed: 2 },
      ],
    },
    goals: {
      active: 1,
      completed: 1,
      milestonesCompleted: 2,
      items: [
        {
          goalId: 'goal-1',
          title: 'Yarı maraton',
          color: '#30d158',
          icon: 'footprints',
          startDate: '2026-11-01',
          targetDate: '2026-12-01',
          percent: 25,
          daysLeft: 7,
          expected: 77,
          pace: 'behind',
          milestonesCompleted: 2,
          tasksCompleted: 1,
        },
      ],
    },
    highlights: [
      { kind: 'habit_rate_up', tone: 'positive', params: { points: 23 } },
      { kind: 'best_weekday', tone: 'positive', params: { weekday: 1, percent: 100 } },
      {
        kind: 'most_productive_day',
        tone: 'positive',
        params: { date: '2026-11-12', count: 3 },
      },
      { kind: 'goals_completed', tone: 'positive', params: { count: 1 } },
    ],
    ...overrides,
  };
}

const emptyOverview = () =>
  overview({
    series: Array.from({ length: 30 }, (_, index) => ({
      from: `2026-11-${pad(index + 1)}`,
      to: `2026-11-${pad(index + 1)}`,
      habits: { due: 0, completed: 0, rate: null },
      tasks: { completed: 0 },
    })),
    habits: {
      due: 0,
      completed: 0,
      missed: 0,
      rate: null,
      previous: { due: 0, completed: 0, rate: null },
      byWeekday: Array.from({ length: 7 }, (_, index) => ({
        weekday: index + 1,
        due: 0,
        completed: 0,
        rate: null,
      })),
      items: [],
    },
    tasks: {
      completed: 0,
      due: 0,
      dueCompleted: 0,
      onTime: 0,
      late: 0,
      withoutDueDate: 0,
      onTimeRate: null,
      overdueOpen: 0,
      previous: { completed: 0 },
      byPriority: ['none', 'low', 'medium', 'high'].map((priority) => ({ priority, completed: 0 })),
      byCategory: [],
    },
    goals: { active: 0, completed: 0, milestonesCompleted: 0, items: [] },
    highlights: [],
  });

const panel = (name) => screen.getByRole('heading', { level: 2, name }).closest('section');

describe('analytics', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is reachable from the navigation and shows the current month', async () => {
    const apiMock = mockApi({
      ...signedInRoutes(),
      'GET /analytics/overview': () => ok(overview()),
    });
    renderApp('/');
    await userEvent.click(await screen.findByRole('link', { name: 'Analiz' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Kasım 2026' }),
    ).toBeInTheDocument();
    expect(apiMock.calls('GET', '/analytics/overview')[0].query).toEqual({ period: 'month' });
    expect(
      screen.getByText('Bu dönem sürüyor; sayılar bugüne kadar olanı gösterir.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Ay' })).toBeChecked();
    // There is nothing after the period that holds today.
    expect(screen.getByRole('button', { name: 'Sonraki dönem' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Bu dönem' })).not.toBeInTheDocument();
  });

  it('shows the key figures with what they are compared to and how they are calculated', async () => {
    mockApi({ ...signedInRoutes(), 'GET /analytics/overview': () => ok(overview()) });
    renderApp('/analytics');

    const figures = (await screen.findByText('Alışkanlık tamamlama')).closest('section');
    expect(within(figures).getByText('%98')).toBeInTheDocument();
    expect(within(figures).getByText('46 günden 45 tanesi tamamlandı')).toBeInTheDocument();
    expect(within(figures).getByText('Önceki döneme göre 23 puan fazla')).toBeInTheDocument();
    expect(within(figures).getByText('8')).toBeInTheDocument();
    expect(within(figures).getByText('Önceki dönem: 5')).toBeInTheDocument();
    expect(within(figures).getByText('%80')).toBeInTheDocument();
    expect(within(figures).getByText('Son tarihi olan 5 görevden 4 tanesi')).toBeInTheDocument();
    expect(within(figures).getByText('1 hedef tamamlandı')).toBeInTheDocument();
    expect(within(figures).getAllByRole('tooltip')[0]).toHaveTextContent(
      'Atlanan ve ertelenen günler ile henüz bitmemiş bugün sayılmaz.',
    );

    // The written report, with dates and weekdays in the user's language.
    const report = panel('Dönem raporu');
    expect(
      within(report).getByText('Alışkanlık tamamlama oranınız önceki döneme göre 23 puan arttı.'),
    ).toBeInTheDocument();
    expect(within(report).getByText('En güçlü gününüz Pazartesi: %100.')).toBeInTheDocument();
    expect(
      within(report).getByText('En çok görev bitirdiğiniz gün 12 Kasım Perşembe: 3 görev.'),
    ).toBeInTheDocument();
    expect(within(report).getByText('Bu dönemde 1 hedefi tamamladınız.')).toBeInTheDocument();
  });

  it('gives every chart the same numbers as a table', async () => {
    mockApi({ ...signedInRoutes(), 'GET /analytics/overview': () => ok(overview()) });
    renderApp('/analytics');

    const habitRows = within(
      within(
        await screen
          .findByRole('heading', { name: 'Alışkanlık tamamlama oranı' })
          .then((h) => h.closest('section')),
      ).getByRole('table'),
    ).getAllByRole('row');
    expect(habitRows).toHaveLength(31);
    expect(habitRows[5]).toHaveTextContent('5 Kasım Perşembe%502 günden 1 tanesi');
    expect(habitRows[24]).toHaveTextContent('24 Kasım SalıZamanı gelen yok');

    const taskRows = within(within(panel('Tamamlanan görevler')).getByRole('table')).getAllByRole(
      'row',
    );
    expect(taskRows[12]).toHaveTextContent('12 Kasım Perşembe3 görev');

    const weekdayRows = within(
      within(panel('Haftanın günlerine göre')).getByRole('table'),
    ).getAllByRole('row');
    expect(weekdayRows).toHaveLength(8);
    expect(weekdayRows[1]).toHaveTextContent('Pazartesi%1006 günden 6 tanesi');
    expect(weekdayRows[4]).toHaveTextContent('Perşembe%836 günden 5 tanesi');
    expect(weekdayRows[7]).toHaveTextContent('PazarZamanı gelen yok');
  });

  it('lists habits in their own unit, tasks by kind and goals against time', async () => {
    mockApi({ ...signedInRoutes(), 'GET /analytics/overview': () => ok(overview()) });
    renderApp('/analytics');

    const habits = within(
      (await screen.findByRole('heading', { name: 'Alışkanlıklar' })).closest('section'),
    );
    const rows = habits.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Kitap oku23 / 23 gün0%100%80');
    expect(rows[2]).toHaveTextContent('SporArşivlendi2 / 3 hafta1%67–');
    expect(habits.getByRole('link', { name: 'Kitap oku' })).toHaveAttribute(
      'href',
      '/habits/habit-1',
    );
    expect(habits.getByRole('progressbar', { name: 'Spor: yüzde 67' })).toBeInTheDocument();

    const tasks = within(panel('Görevler'));
    expect(tasks.getByText('6 görevden 5 tanesi bitti')).toBeInTheDocument();
    expect(tasks.getByText('Şu anda gecikmiş açık görevler')).toBeInTheDocument();
    expect(tasks.getByRole('progressbar', { name: 'Yüksek: 2 görev' })).toBeInTheDocument();
    expect(tasks.getByRole('progressbar', { name: 'İş: 6 görev' })).toBeInTheDocument();
    expect(tasks.getByRole('progressbar', { name: 'Kategorisiz: 2 görev' })).toBeInTheDocument();

    const goals = within(panel('Hedefler'));
    expect(goals.getByRole('link', { name: 'Yarı maraton' })).toHaveAttribute(
      'href',
      '/goals/goal-1',
    );
    expect(goals.getByText('Geride')).toBeInTheDocument();
    expect(goals.getByText('%25')).toBeInTheDocument();
    expect(goals.getByText('7 gün kaldı')).toBeInTheDocument();
    expect(goals.getByText('Geçen süreye göre beklenen: %77')).toBeInTheDocument();
    expect(goals.getByText('Bu dönemde 2 kilometre taşı')).toBeInTheDocument();
  });

  it('switches the period and moves between periods', async () => {
    const october = overview({
      range: { from: '2026-10-01', to: '2026-10-31' },
      previousRange: { from: '2026-09-01', to: '2026-09-30' },
      complete: true,
    });
    const quarter = overview({
      period: 'quarter',
      bucket: 'week',
      range: { from: '2026-10-01', to: '2026-12-31' },
      series: [
        {
          from: '2026-10-01',
          to: '2026-10-04',
          habits: { due: 4, completed: 2, rate: 0.5 },
          tasks: { completed: 1 },
        },
      ],
    });
    const apiMock = mockApi({
      ...signedInRoutes(),
      'GET /analytics/overview': ({ query }) =>
        ok(query.period === 'quarter' ? quarter : query.date ? october : overview()),
    });
    renderApp('/analytics');

    await userEvent.click(await screen.findByRole('button', { name: 'Önceki dönem' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Ekim 2026' })).toBeInTheDocument();
    expect(apiMock.calls('GET', '/analytics/overview').at(-1).query).toEqual({
      period: 'month',
      date: '2026-10-31',
    });
    expect(screen.queryByText(/Bu dönem sürüyor/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sonraki dönem' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Bu dönem' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Kasım 2026' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Çeyrek' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: '2026 · 4. çeyrek' }),
    ).toBeInTheDocument();
    expect(apiMock.calls('GET', '/analytics/overview').at(-1).query).toEqual({
      period: 'quarter',
    });
    const weekRows = within(
      within(panel('Alışkanlık tamamlama oranı')).getByRole('table'),
    ).getAllByRole('row');
    expect(weekRows[0]).toHaveTextContent('Hafta');
    expect(weekRows[1]).toHaveTextContent('1 Eki – 4 Eki%504 günden 2 tanesi');
  });

  it('exports the series as CSV and prints the report', async () => {
    mockApi({ ...signedInRoutes(), 'GET /analytics/overview': () => ok(overview()) });
    const blobs = [];
    // jsdom has no object URLs; the two functions exist only for this test.
    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return 'blob:test';
    };
    URL.revokeObjectURL = () => {};
    const clicked = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function record() {
        clicked.push(this.download);
      });
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderApp('/analytics');

    await userEvent.click(await screen.findByRole('button', { name: 'CSV indir' }));
    expect(clicked).toEqual(['personalitify-analiz-2026-11-01-2026-11-30.csv']);
    const lines = (await blobs[0].text()).trim().split('\r\n');
    expect(lines).toHaveLength(31);
    expect(lines[0]).toContain('Başlangıç,Bitiş,Zamanı gelen alışkanlık günleri');
    expect(lines[5]).toBe('2026-11-05,2026-11-05,2,1,50,0');
    expect(lines[24]).toBe('2026-11-24,2026-11-24,0,0,,0');

    await userEvent.click(screen.getByRole('button', { name: 'Yazdır' }));
    expect(print).toHaveBeenCalledTimes(1);
    click.mockRestore();
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });

  it('quotes CSV cells that need it', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', null, 3]]).slice(1)).toBe('a,"b,c","say ""hi""",,3\r\n');
  });

  it('explains an empty period and offers a retry when loading fails', async () => {
    let failing = false;
    mockApi({
      ...signedInRoutes(),
      'GET /analytics/overview': () =>
        failing ? fail(500, 'INTERNAL_ERROR') : ok(emptyOverview()),
    });
    const view = renderApp('/analytics');

    expect(await screen.findByText('Bu dönemde zamanı gelen alışkanlık yok')).toBeInTheDocument();
    expect(screen.getByText('Son tarihi olan görev bitirilmedi')).toBeInTheDocument();
    expect(screen.getByText('Bu dönem için öne çıkarılacak yeterli veri yok.')).toBeInTheDocument();
    expect(screen.getByText('Bu dönemde etkin bir alışkanlık yok')).toBeInTheDocument();
    expect(screen.getByText('Bu dönemde bitirilen görev yok')).toBeInTheDocument();
    expect(screen.getByText('Etkin hedef yok')).toBeInTheDocument();
    view.unmount();

    failing = true;
    renderApp('/analytics');
    const retry = await screen.findByRole('button', { name: 'Yeniden dene' });
    failing = false;
    await userEvent.click(retry);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Kasım 2026' })).toBeInTheDocument(),
    );
  });
});
