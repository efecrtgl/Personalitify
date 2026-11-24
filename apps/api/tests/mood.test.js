import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const NOON = '2026-11-24T09:00:00.000Z'; // Tuesday, 12:00 in Istanbul
const TODAY = '2026-11-24';

function setNow(iso = NOON) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

describe('mood', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  const put = async (user, date, body, status = 200) =>
    (await user.put(`/mood/${date}`, body).expect(status)).body.data;

  it('keeps one entry per day and updates it in place', async () => {
    setNow();
    const user = await registerUser();

    const created = await put(user, TODAY, {
      score: 4,
      emotions: ['calm', 'grateful', 'calm'],
      note: 'A quiet day',
    });
    expect(created).toMatchObject({
      date: TODAY,
      score: 4,
      emotions: ['calm', 'grateful'],
      note: 'A quiet day',
      version: 1,
    });

    // Changing only the score keeps the feelings and the note.
    const updated = await put(user, TODAY, { score: 2 });
    expect(updated).toMatchObject({
      id: created.id,
      score: 2,
      emotions: ['calm', 'grateful'],
      note: 'A quiet day',
      version: 2,
    });
    const cleared = await put(user, TODAY, { score: 2, emotions: [], note: '' });
    expect(cleared).toMatchObject({ emotions: [], note: '', version: 3 });

    const range = (await user.get(`/mood?from=${TODAY}&to=${TODAY}`).expect(200)).body.data;
    expect(range.entries).toHaveLength(1);
  });

  it('accepts only real scores, known feelings and days that have begun', async () => {
    setNow();
    const user = await registerUser();
    await put(user, TODAY, { score: 0 }, 400);
    await put(user, TODAY, { score: 6 }, 400);
    await put(user, TODAY, { score: 3.5 }, 400);
    await put(user, TODAY, {}, 400);
    await put(user, TODAY, { score: 3, emotions: ['ecstatic'] }, 400);
    await put(user, TODAY, { score: 3, note: 'x'.repeat(1001) }, 400);
    await put(user, '2026-02-30', { score: 3 }, 400);
    // Tomorrow is tolerated for a device ahead of the account's time zone; later is not.
    await put(user, '2026-11-25', { score: 3 });
    await put(user, '2026-11-26', { score: 3 }, 400);
  });

  it('summarizes a range from the recorded entries', async () => {
    setNow();
    const user = await registerUser();
    await put(user, '2026-11-16', { score: 2, emotions: ['tired', 'stressed'] }); // Monday
    await put(user, '2026-11-17', { score: 4, emotions: ['calm'] });
    await put(user, '2026-11-23', { score: 5, emotions: ['calm', 'happy'] }); // Monday
    await put(user, TODAY, { score: 4, emotions: ['calm'] });
    await put(user, '2026-10-30', { score: 1 });

    const range = (await user.get('/mood?from=2026-11-01&to=2026-11-30').expect(200)).body.data;
    expect(range).toMatchObject({ from: '2026-11-01', to: '2026-11-30', today: TODAY });
    expect(range.entries.map((entry) => entry.date)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-23',
      TODAY,
    ]);
    expect(range.summary).toEqual({
      count: 4,
      average: 3.75,
      distribution: [
        { score: 1, count: 0 },
        { score: 2, count: 1 },
        { score: 3, count: 0 },
        { score: 4, count: 2 },
        { score: 5, count: 1 },
      ],
      emotions: [
        { emotion: 'calm', count: 3 },
        { emotion: 'happy', count: 1 },
        { emotion: 'tired', count: 1 },
        { emotion: 'stressed', count: 1 },
      ],
      byWeekday: [
        { weekday: 1, count: 2, average: 3.5 },
        { weekday: 2, count: 2, average: 4 },
        { weekday: 3, count: 0, average: null },
        { weekday: 4, count: 0, average: null },
        { weekday: 5, count: 0, average: null },
        { weekday: 6, count: 0, average: null },
        { weekday: 7, count: 0, average: null },
      ],
    });

    const empty = (await user.get('/mood?from=2026-09-01&to=2026-09-30').expect(200)).body.data;
    expect(empty.summary).toMatchObject({ count: 0, average: null, emotions: [] });
    await user.get('/mood?from=2026-11-30&to=2026-11-01').expect(400);
    await user.get('/mood?from=2025-01-01&to=2026-11-30').expect(400);
    await user.get('/mood').expect(400);
  });

  it('removes a day and lets it be recorded again', async () => {
    setNow();
    const user = await registerUser();
    const first = await put(user, TODAY, { score: 1, note: 'Rough' });
    await user.delete(`/mood/${TODAY}`).expect(204);
    await user.delete(`/mood/${TODAY}`).expect(404);

    const second = await put(user, TODAY, { score: 5 });
    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ score: 5, note: '', version: 1 });
  });

  it('keeps each account’s mood to itself and includes it in the export', async () => {
    setNow();
    const user = await registerUser();
    const other = await registerUser();
    await put(user, TODAY, { score: 2, note: 'Private thought' });
    await put(other, TODAY, { score: 5 });

    const mine = (await user.get(`/mood?from=${TODAY}&to=${TODAY}`).expect(200)).body.data;
    expect(mine.entries).toMatchObject([{ score: 2, note: 'Private thought' }]);
    const theirs = (await other.get(`/mood?from=${TODAY}&to=${TODAY}`).expect(200)).body.data;
    expect(theirs.entries).toMatchObject([{ score: 5, note: '' }]);

    const exported = (await user.get('/account/export').expect(200)).body.data.data;
    expect(exported.moodEntry).toMatchObject([{ date: TODAY, score: 2 }]);
  });
});
