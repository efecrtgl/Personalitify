import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, mockApi, noContent, ok, renderApp, signedInRoutes } from '../test/harness.jsx';
import { DRAG_TYPE } from './CalendarItem.jsx';
import {
  itemsOfDay,
  layoutTimed,
  monthWeeks,
  shiftAnchor,
  snapMinutes,
  toMinutes,
  toTime,
  viewRange,
  weekDates,
} from './layout.js';

const TODAY = '2026-11-24';

function item(overrides = {}) {
  return {
    id: 'event:e1:2026-11-24',
    kind: 'event',
    sourceId: 'e1',
    occurrenceDate: '2026-11-24',
    title: 'Toplantı',
    color: null,
    categoryId: null,
    eventKind: 'event',
    recurring: false,
    location: '',
    status: null,
    allDay: false,
    date: TODAY,
    startTime: '10:00',
    endDate: TODAY,
    endTime: '11:00',
    startsAt: '2026-11-24T07:00:00.000Z',
    endsAt: '2026-11-24T08:00:00.000Z',
    ...overrides,
  };
}

describe('calendar layout', () => {
  it('builds whole weeks for a month, following the first day of the week', () => {
    const monday = monthWeeks('2026-11-24', 1);
    expect(monday).toHaveLength(6);
    expect(monday[0][0]).toBe('2026-10-26');
    expect(monday.at(-1)[6]).toBe('2026-12-06');

    const sunday = monthWeeks('2026-11-24', 7);
    expect(sunday).toHaveLength(5);
    expect(sunday[0][0]).toBe('2026-11-01');
    expect(sunday.at(-1)[6]).toBe('2026-12-05');
    // February 2026 starts on a Sunday and has exactly four weeks.
    expect(monthWeeks('2026-02-10', 7)).toHaveLength(4);
  });

  it('computes the range and the neighbours of each view', () => {
    expect(viewRange('day', TODAY, 1)).toEqual({ from: TODAY, to: TODAY });
    expect(viewRange('week', TODAY, 1)).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(viewRange('week', TODAY, 7)).toEqual({ from: '2026-11-22', to: '2026-11-28' });
    expect(viewRange('month', TODAY, 1)).toEqual({ from: '2026-10-26', to: '2026-12-06' });
    expect(weekDates(TODAY, 6)[0]).toBe('2026-11-21');

    expect(shiftAnchor('day', '2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftAnchor('week', TODAY, -1)).toBe('2026-11-17');
    // From the 31st, the next month is December, not a skipped month.
    expect(shiftAnchor('month', '2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftAnchor('month', '2026-01-15', -1)).toBe('2025-12-01');
  });

  it('converts between times and minutes and snaps to quarter hours', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toTime(570)).toBe('09:30');
    expect(toTime(-5)).toBe('00:00');
    expect(toTime(5000)).toBe('23:59');
    expect(snapMinutes(577)).toBe(570);
    expect(snapMinutes(583)).toBe(585);
  });

  it('splits a day into all-day and timed items, including multi-day ones', () => {
    const items = [
      item({ id: 'trip', allDay: true, date: '2026-11-23', endDate: '2026-11-25' }),
      item({ id: 'night', date: '2026-11-23', startTime: '23:00', endTime: '01:00' }),
      item({ id: 'midnight', date: '2026-11-23', startTime: '22:00', endTime: '00:00' }),
      item({ id: 'meeting' }),
      item({ id: 'tomorrow', date: '2026-11-25', endDate: '2026-11-25' }),
    ];
    const day = itemsOfDay(items, TODAY);
    expect(day.allDay.map((entry) => entry.id)).toEqual(['trip']);
    // An item that ends exactly at midnight does not spill into the next day.
    expect(day.timed.map((entry) => entry.id)).toEqual(['night', 'meeting']);
  });

  it('places overlapping items side by side and leaves others at full width', () => {
    const placed = layoutTimed(
      [
        item({ id: 'a', startTime: '09:00', endTime: '10:30' }),
        item({ id: 'b', startTime: '09:30', endTime: '10:00' }),
        item({ id: 'c', startTime: '10:00', endTime: '11:00' }),
        item({ id: 'd', startTime: '14:00', endTime: '15:00' }),
      ],
      TODAY,
    );
    const by = Object.fromEntries(placed.map((entry) => [entry.item.id, entry]));
    expect(by.a).toMatchObject({ start: 540, end: 630, column: 0, columns: 2 });
    expect(by.b).toMatchObject({ column: 1, columns: 2 });
    // c starts when b ends, so it reuses b's column.
    expect(by.c).toMatchObject({ column: 1, columns: 2 });
    expect(by.d).toMatchObject({ column: 0, columns: 1 });
  });

  it('clips items that start or end on another day and keeps short ones visible', () => {
    const [overnight] = layoutTimed(
      [item({ date: '2026-11-23', startTime: '23:00', endTime: '01:00' })],
      TODAY,
    );
    expect(overnight).toMatchObject({ start: 0, end: 60 });
    const [tiny] = layoutTimed([item({ startTime: '10:00', endTime: '10:05' })], TODAY);
    expect(tiny.end - tiny.start).toBe(20);
  });
});

const feed =
  (items = [], conflicts = []) =>
  (request) =>
    ok({
      from: request.query.from,
      to: request.query.to,
      today: TODAY,
      timeZone: 'Europe/Istanbul',
      items,
      conflicts,
    });

const routes = (items, conflicts) => ({
  ...signedInRoutes(account()),
  'GET /categories': () => ok([]),
  'GET /goals': () => ok([]),
  'GET /calendar': feed(items, conflicts),
});

describe('calendar page', () => {
  it('shows a month with its items and asks the server for the visible range', async () => {
    const api = mockApi(
      routes([
        item(),
        item({
          id: 'task:t1:2026-11-24',
          kind: 'task',
          sourceId: 't1',
          title: 'Raporu yaz',
          allDay: true,
          startTime: null,
          endTime: null,
          startsAt: null,
          endsAt: null,
          status: 'todo',
        }),
        item({
          id: 'habit:h1:2026-11-25',
          kind: 'habit',
          sourceId: 'h1',
          title: 'Kitap oku',
          date: '2026-11-25',
          endDate: '2026-11-25',
          allDay: true,
          startTime: null,
          endTime: null,
          color: '#30d158',
          status: 'pending',
        }),
      ]),
    );
    renderApp(`/calendar?view=month&date=${TODAY}`);

    expect(await screen.findByRole('grid', { name: 'Kasım 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Toplantı, Etkinlik, 10:00/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Raporu yaz, Görev/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Kitap oku, Alışkanlık/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '24 Kasım Salı' })).toHaveAttribute(
      'aria-current',
      'date',
    );
    expect(api.calls('GET', '/calendar')[0].query).toEqual({
      from: '2026-10-26',
      to: '2026-12-06',
      include: 'event,task,habit',
    });
  });

  it('navigates between months, switches views and opens a day', async () => {
    const user = userEvent.setup();
    const api = mockApi(routes([item()]));
    renderApp(`/calendar?view=month&date=${TODAY}`);
    await screen.findByRole('grid', { name: 'Kasım 2026' });

    await user.click(screen.getByRole('button', { name: 'Sonraki ay' }));
    expect(await screen.findByRole('grid', { name: 'Aralık 2026' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Hafta' }));
    expect(await screen.findByRole('heading', { name: '30 Kas – 6 Ara' })).toBeInTheDocument();
    expect(api.calls('GET', '/calendar').at(-1).query).toMatchObject({
      from: '2026-11-30',
      to: '2026-12-06',
    });

    await user.click(screen.getByRole('button', { name: 'Bugün' }));
    await user.click(await screen.findByRole('button', { name: '24 Kasım Salı' }));
    expect(await screen.findByRole('heading', { name: '24 Kasım Salı' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Toplantı, Etkinlik, 10:00 – 11:00/ }),
    ).toBeInTheDocument();
    expect(api.calls('GET', '/calendar').at(-1).query).toMatchObject({ from: TODAY, to: TODAY });
  });

  it('hides a kind of item when it is switched off', async () => {
    const user = userEvent.setup();
    const api = mockApi(routes([]));
    renderApp(`/calendar?view=week&date=${TODAY}`);
    await user.click(await screen.findByRole('checkbox', { name: 'Alışkanlıklar' }));
    await waitFor(() =>
      expect(api.calls('GET', '/calendar').at(-1).query.include).toBe('event,task'),
    );
  });

  it('creates an event and warns when it overlaps another entry', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...routes([]),
      'POST /calendar/events': ({ body }) =>
        ok({
          event: { id: 'new', version: 1, ...body },
          conflicts: [item({ title: 'Diş hekimi' })],
        }),
    });
    renderApp(`/calendar?view=month&date=${TODAY}`);

    await user.click(await screen.findByRole('button', { name: 'Yeni etkinlik' }));
    const dialog = screen.getByRole('dialog', { name: 'Yeni etkinlik' });
    await user.click(within(dialog).getByRole('button', { name: 'Etkinlik oluştur' }));
    expect(within(dialog).getByText('Bu alan zorunludur.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Başlık'), 'Proje sunumu');
    await user.click(within(dialog).getByRole('radio', { name: 'Zaman bloğu' }));
    await user.selectOptions(within(dialog).getByLabelText('Hatırlatıcı'), '30');
    await user.click(within(dialog).getByRole('button', { name: 'Etkinlik oluştur' }));

    await waitFor(() => expect(api.calls('POST', '/calendar/events')).toHaveLength(1));
    expect(api.calls('POST', '/calendar/events')[0].body).toMatchObject({
      title: 'Proje sunumu',
      kind: 'block',
      allDay: false,
      startDate: TODAY,
      startTime: '09:00',
      endDate: TODAY,
      endTime: '10:00',
      recurrence: null,
      reminderMinutes: [30],
    });
    expect(await screen.findByText('Kaydedildi. "Diş hekimi" ile çakışıyor.')).toBeInTheDocument();
  });

  it('marks conflicting items and moves an event by drag and drop', async () => {
    const meeting = item();
    const other = item({
      id: 'event:e2:2026-11-24',
      sourceId: 'e2',
      title: 'Görüşme',
      startTime: '10:30',
      endTime: '11:30',
    });
    const api = mockApi({
      ...routes([meeting, other], [[meeting.id, other.id]]),
      'POST /calendar/events/e1/move': ({ body }) =>
        ok({ event: { id: 'e1', version: 2, startDate: body.date }, conflicts: [] }),
    });
    renderApp(`/calendar?view=month&date=${TODAY}`);

    const chip = await screen.findByRole('button', {
      name: /^Toplantı, Etkinlik, 10:00, başka bir kayıtla çakışıyor/,
    });
    const target = screen
      .getByRole('button', { name: '26 Kasım Perşembe' })
      .closest('[role="gridcell"]');
    const data = new Map();
    const dataTransfer = {
      setData: (type, value) => data.set(type, value),
      getData: (type) => data.get(type) ?? '',
      get types() {
        return [...data.keys()];
      },
    };
    fireEvent.dragStart(chip, { dataTransfer });
    expect(data.get(DRAG_TYPE)).toBe(meeting.id);
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(api.calls('POST', '/calendar/events/e1/move')).toHaveLength(1));
    expect(api.calls('POST', '/calendar/events/e1/move')[0].body).toEqual({ date: '2026-11-26' });
  });

  it('reschedules a task by dropping it on another day', async () => {
    const taskItem = item({
      id: 'task:t1:2026-11-24',
      kind: 'task',
      sourceId: 't1',
      title: 'Raporu yaz',
      allDay: true,
      startTime: null,
      endTime: null,
      startsAt: null,
      endsAt: null,
      status: 'todo',
    });
    const api = mockApi({
      ...routes([taskItem]),
      'PATCH /tasks/t1': ({ body }) => ok({ id: 't1', ...body }),
    });
    renderApp(`/calendar?view=month&date=${TODAY}`);
    const chip = await screen.findByRole('button', { name: /^Raporu yaz, Görev/ });
    const target = screen
      .getByRole('button', { name: '27 Kasım Cuma' })
      .closest('[role="gridcell"]');
    const dataTransfer = { getData: () => taskItem.id, setData: () => {}, types: [DRAG_TYPE] };
    fireEvent.dragStart(chip, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(api.calls('PATCH', '/tasks/t1')).toHaveLength(1));
    expect(api.calls('PATCH', '/tasks/t1')[0].body).toEqual({ scheduledDate: '2026-11-27' });
  });

  it('opens a repeating event for editing and deletes a single occurrence', async () => {
    const user = userEvent.setup();
    const series = {
      id: 'e1',
      version: 4,
      title: 'Yoga',
      description: '',
      location: '',
      categoryId: null,
      color: null,
      kind: 'event',
      allDay: false,
      timeZone: 'Europe/Istanbul',
      startDate: '2026-11-01',
      startTime: '18:00',
      endDate: '2026-11-01',
      endTime: '19:00',
      recurrence: { frequency: 'daily', interval: 1, weekdays: [], monthDays: [] },
      recurrenceEndDate: null,
      excludedDates: [],
      reminderMinutes: [],
      taskId: null,
      habitId: null,
      goalId: null,
    };
    const api = mockApi({
      ...routes([item({ title: 'Yoga', recurring: true, startTime: '18:00', endTime: '19:00' })]),
      'GET /calendar/events/e1': () => ok(series),
      'DELETE /calendar/events/e1/occurrences/2026-11-24': () => noContent(),
    });
    renderApp(`/calendar?view=month&date=${TODAY}`);

    await user.click(await screen.findByRole('button', { name: /^Yoga, Etkinlik/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Etkinliği düzenle' });
    expect(within(dialog).getByText(/Değişiklikler tüm tekrarlara uygulanır/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Başlık')).toHaveValue('Yoga');

    await user.click(within(dialog).getByRole('button', { name: 'Bu tekrarı sil' }));
    const confirm = await screen.findByRole('dialog', { name: /bu tekrarı silinsin mi/ });
    await user.click(within(confirm).getByRole('button', { name: 'Sil' }));
    await waitFor(() =>
      expect(api.calls('DELETE', '/calendar/events/e1/occurrences/2026-11-24')).toHaveLength(1),
    );
    expect(await screen.findByText('Takvimden kaldırıldı')).toBeInTheDocument();
  });
});
