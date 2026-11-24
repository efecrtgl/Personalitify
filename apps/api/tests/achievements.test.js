import {
  ACHIEVEMENTS,
  focusXp,
  levelForXp,
  levelProgress,
  xpForLevel,
} from '@personalitify/shared-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  desiredGrants,
  handleProgressEvent,
} from '../src/modules/achievements/achievements.service.js';
import { UserProgress, XpGrant } from '../src/modules/achievements/progress.model.js';
import { SyncEvent } from '../src/modules/events/sync-event.model.js';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const START = Date.parse('2026-11-24T09:00:00.000Z'); // Tuesday, 12:00 in Istanbul
const TODAY = '2026-11-24';

function setClock(seconds = 0) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(START + seconds * 1000));
}

describe('progress rules', () => {
  it('starts each level 100 XP later than the one before', () => {
    expect([1, 2, 3, 4, 5, 10].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000, 4500]);
    expect([0, 99, 100, 299, 300, 1000, 4499, 4500].map(levelForXp)).toEqual([
      1, 1, 2, 2, 3, 5, 9, 10,
    ]);
    expect(levelProgress(150)).toEqual({
      level: 2,
      levelXp: 100,
      nextLevelXp: 300,
      intoLevel: 50,
      needed: 150,
      progress: 0.25,
    });
  });

  it('pays focus time in whole five-minute blocks, up to a cap', () => {
    expect([0, 299, 300, 1500, 3600, 10800].map(focusXp)).toEqual([0, 0, 2, 10, 24, 24]);
  });

  it('derives the XP of a record from its state alone', () => {
    const zone = 'Europe/Istanbul';
    const entry = { _id: 'e1', status: 'active', value: 1, target: 1, date: TODAY };
    expect(desiredGrants('habitEntry', entry, zone)).toEqual([
      { key: 'habit:e1', rule: 'habit_completed', amount: 10, date: TODAY },
    ]);
    expect(desiredGrants('habitEntry', { ...entry, value: 0 }, zone)).toEqual([]);
    expect(desiredGrants('habitEntry', { ...entry, status: 'skipped' }, zone)).toEqual([]);

    const task = { _id: 't1', status: 'done', priority: 'none', completedOn: '2026-11-20' };
    expect(desiredGrants('task', task, zone)).toEqual([
      { key: 'task:t1', rule: 'task_completed', amount: 5, date: '2026-11-20' },
    ]);
    expect(desiredGrants('task', { ...task, priority: 'high' }, zone)[0]).toMatchObject({
      rule: 'task_completed_high',
      amount: 10,
    });
    expect(desiredGrants('task', { ...task, status: 'todo' }, zone)).toEqual([]);

    const goal = {
      _id: 'g1',
      status: 'completed',
      // 22:30 UTC is already the next day in Istanbul.
      completedAt: new Date('2026-11-23T22:30:00.000Z'),
      milestones: [
        { id: 'm1', done: true, completedAt: new Date('2026-11-20T09:00:00.000Z') },
        { id: 'm2', done: false, completedAt: null },
      ],
    };
    expect(desiredGrants('goal', goal, zone)).toEqual([
      { key: 'milestone:g1:m1', rule: 'milestone_completed', amount: 15, date: '2026-11-20' },
      { key: 'goal:g1', rule: 'goal_completed', amount: 50, date: TODAY },
    ]);

    const session = {
      _id: 's1',
      kind: 'focus',
      status: 'completed',
      elapsedSeconds: 1500,
      date: TODAY,
    };
    expect(desiredGrants('focusSession', session, zone)).toEqual([
      { key: 'focus:s1', rule: 'focus_block', amount: 10, date: TODAY },
    ]);
    expect(desiredGrants('focusSession', { ...session, kind: 'short_break' }, zone)).toEqual([]);
    expect(desiredGrants('focusSession', { ...session, status: 'cancelled' }, zone)).toEqual([]);
    expect(desiredGrants('focusSession', { ...session, elapsedSeconds: 200 }, zone)).toEqual([]);

    // Journal XP belongs to the day of writing, whatever day the entry is about.
    const written = { _id: 'j1', date: '2026-01-01', createdAt: new Date(START) };
    expect(desiredGrants('journalEntry', written, zone)).toEqual([
      { key: `journal:${TODAY}`, rule: 'journal_written', amount: 5, date: TODAY },
    ]);
    expect(desiredGrants('moodEntry', { _id: 'm1', date: '2026-11-22' }, zone)).toEqual([
      { key: 'mood:2026-11-22', rule: 'mood_recorded', amount: 2, date: '2026-11-22' },
    ]);
    expect(desiredGrants('category', { _id: 'c1' }, zone)).toEqual([]);
  });
});

describe('achievements', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  const progressOf = async (user) => (await user.get('/achievements').expect(200)).body.data;
  const post = async (user, path, body) => (await user.post(path, body).expect(201)).body.data;
  /**
   * Polls until `check` passes. Unlike `vi.waitFor` it never advances the frozen clock,
   * which the focus rules depend on.
   */
  async function eventually(check) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await check();
      } catch (error) {
        if (attempt >= 50) throw error;
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }
  /** Waits until the event handlers have brought the total to `xp`. */
  const expectXp = (user, xp) =>
    eventually(async () => expect((await progressOf(user)).xp.total).toBe(xp));
  const unlockedKeys = (progress) =>
    progress.achievements.filter((item) => item.unlocked).map((item) => item.key);

  it('starts at level one with every achievement locked', async () => {
    setClock();
    const user = await registerUser();
    const progress = await progressOf(user);
    expect(progress).toMatchObject({
      today: TODAY,
      xp: { total: 0, today: 0, week: 0 },
      level: { level: 1, levelXp: 0, nextLevelXp: 100, intoLevel: 0, needed: 100, progress: 0 },
      recent: [],
    });
    expect(progress.achievements).toHaveLength(ACHIEVEMENTS.length);
    expect(progress.achievements.every((item) => !item.unlocked)).toBe(true);
    // Nothing has been counted yet; the level achievements start from level one.
    expect(progress.achievements.map((item) => item.current)).toEqual(
      ACHIEVEMENTS.map((item) => (item.metric === 'level' ? 1 : 0)),
    );
    expect(progress.achievements[0]).toEqual({
      key: 'habit_first',
      group: 'habits',
      metric: 'habitCompletions',
      target: 1,
      current: 0,
      unlocked: false,
      unlockedAt: null,
    });
  });

  it('grants XP once per habit day and takes it back when the day is undone', async () => {
    setClock();
    const user = await registerUser();
    const habit = await post(user, '/habits', {
      name: 'Read',
      color: '#0a84ff',
      startDate: TODAY,
      target: { kind: 'count', value: 3 },
    });
    const url = `/habits/${habit.id}/entries/${TODAY}`;

    // Progress below the target earns nothing yet.
    await user.put(url, { value: 2 }).expect(200);
    await expectXp(user, 0);
    await user.put(url, { value: 3 }).expect(200);
    await expectXp(user, 10);
    // More of the same day, or saving it again, is still one completion.
    await user.put(url, { value: 5 }).expect(200);
    await user.put(url, { value: 5, note: 'evening' }).expect(200);
    await expectXp(user, 10);

    let progress = await progressOf(user);
    expect(unlockedKeys(progress)).toEqual(['habit_first']);
    expect(progress.achievements[0]).toMatchObject({
      current: 1,
      unlocked: true,
      unlockedAt: new Date(START).toISOString(),
    });
    expect(progress.recent).toMatchObject([
      { rule: 'habit_completed', amount: 10, entityType: 'habitEntry', date: TODAY },
    ]);

    // Dropping below the target, and clearing the day, both undo the completion.
    await user.put(url, { value: 1 }).expect(200);
    await expectXp(user, 0);
    await user.put(url, { value: 3 }).expect(200);
    await expectXp(user, 10);
    await user.delete(url).expect(200);
    await expectXp(user, 0);

    // What was reached stays reached.
    progress = await progressOf(user);
    expect(unlockedKeys(progress)).toEqual(['habit_first']);
    expect(progress.achievements[0]).toMatchObject({ current: 1, unlocked: true });
  });

  it('follows tasks, goals, focus, journal and mood by their rules', async () => {
    setClock();
    const user = await registerUser();

    // Tasks: 5, or 10 with high priority; reopening takes it back; deleting keeps it.
    const task = await post(user, '/tasks', { title: 'Plain' });
    const urgent = await post(user, '/tasks', { title: 'Urgent', priority: 'high' });
    await user.post(`/tasks/${task.id}/complete`).expect(200);
    await user.post(`/tasks/${urgent.id}/complete`).expect(200);
    await expectXp(user, 15);
    await user.post(`/tasks/${task.id}/reopen`).expect(200);
    await expectXp(user, 10);
    await user.post(`/tasks/${task.id}/complete`).expect(200);
    await expectXp(user, 15);
    await user.delete(`/tasks/${urgent.id}`).expect(204);
    await expectXp(user, 15);

    // Goals: 15 per milestone, 50 for the goal; an unticked milestone is taken back.
    const goal = await post(user, '/goals', {
      title: 'Marathon',
      color: '#30d158',
      progress: { mode: 'milestones' },
    });
    let milestones = [];
    for (const title of ['5 km', '10 km']) {
      milestones = (await post(user, `/goals/${goal.id}/milestones`, { title })).milestones;
    }
    for (const milestone of milestones) {
      await user.patch(`/goals/${goal.id}/milestones/${milestone.id}`, { done: true }).expect(200);
    }
    await expectXp(user, 45);
    await user
      .patch(`/goals/${goal.id}/milestones/${milestones[1].id}`, { done: false })
      .expect(200);
    await expectXp(user, 30);
    await user.patch(`/goals/${goal.id}`, { status: 'completed' }).expect(200);
    await expectXp(user, 80);

    // Journal: once per day of writing. Mood: once per day; changing it earns nothing more.
    await post(user, '/journal', { title: 'Morning' });
    await post(user, '/journal', { title: 'Evening', date: '2026-11-01' });
    await expectXp(user, 85);
    await user.put(`/mood/${TODAY}`, { score: 4 }).expect(200);
    await user.put(`/mood/${TODAY}`, { score: 5 }).expect(200);
    await user.put('/mood/2026-11-23', { score: 3 }).expect(200);
    await expectXp(user, 89);

    // Focus: ten minutes are two blocks; a break and an abandoned session earn nothing.
    const session = await post(user, '/focus/sessions', { plannedMinutes: 30 });
    setClock(600);
    await user.post(`/focus/sessions/${session.id}/complete`).expect(200);
    await expectXp(user, 93);
    const pause = await post(user, '/focus/sessions', { kind: 'short_break', plannedMinutes: 10 });
    setClock(700);
    await user.post(`/focus/sessions/${pause.id}/complete`).expect(200);
    const abandoned = await post(user, '/focus/sessions', { plannedMinutes: 30 });
    setClock(760);
    await user.post(`/focus/sessions/${abandoned.id}/cancel`).expect(200);
    await expectXp(user, 93);

    const progress = await progressOf(user);
    expect(progress.xp).toEqual({ total: 93, today: 91, week: 93 });
    expect(progress.level).toMatchObject({ level: 1, intoLevel: 93, needed: 7 });
    expect(unlockedKeys(progress)).toEqual([
      'task_first',
      'goal_first',
      'focus_first',
      'journal_first',
    ]);
    const current = Object.fromEntries(
      progress.achievements.map((item) => [item.key, item.current]),
    );
    expect(current).toMatchObject({
      task_50: 2,
      milestone_10: 1,
      goal_5: 1,
      focus_10h: 600,
      journal_30: 2,
      mood_7: 2,
      level_5: 1,
    });
    expect(progress.recent[0]).toMatchObject({ rule: 'focus_block', amount: 4 });
    expect(progress.recent.map((grant) => grant.rule)).toContain('task_completed_high');

    // One more task crosses 100 XP: level two.
    const more = await post(user, '/tasks', { title: 'One more', priority: 'high' });
    await user.post(`/tasks/${more.id}/complete`).expect(200);
    await expectXp(user, 103);
    expect((await progressOf(user)).level).toMatchObject({
      level: 2,
      levelXp: 100,
      nextLevelXp: 300,
      intoLevel: 3,
    });
  });

  it('remembers the longest streak even after the habit is gone', async () => {
    setClock();
    const user = await registerUser();
    const habit = await post(user, '/habits', {
      name: 'Run',
      color: '#30d158',
      startDate: '2026-11-18',
    });
    for (let dayOfMonth = 18; dayOfMonth <= 24; dayOfMonth += 1) {
      await user.put(`/habits/${habit.id}/entries/2026-11-${dayOfMonth}`, { value: 1 }).expect(200);
    }
    await eventually(async () => {
      const progress = await progressOf(user);
      expect(unlockedKeys(progress)).toEqual(['habit_first', 'streak_7']);
      const streak30 = progress.achievements.find((item) => item.key === 'streak_30');
      expect(streak30.current).toBe(7);
    });

    await user.delete(`/habits/${habit.id}`).expect(204);
    const progress = await progressOf(user);
    expect(unlockedKeys(progress)).toEqual(['habit_first', 'streak_7']);
    expect(progress.achievements.find((item) => item.key === 'streak_30').current).toBe(7);
  });

  it('gives the same result when an event is handled again', async () => {
    setClock();
    const user = await registerUser();
    const task = await post(user, '/tasks', { title: 'Once' });
    await user.post(`/tasks/${task.id}/complete`).expect(200);
    await expectXp(user, 5);
    const userId = (await user.get('/users/me').expect(200)).body.data.user.id;

    const event = { userId, entityType: 'task', entityId: task.id, event: 'task.updated' };
    await handleProgressEvent(event);
    await handleProgressEvent(event);
    await handleProgressEvent({ ...event, entityId: '7b0c1f0e-6f0e-4d8b-9a55-3f0a6c1d2e3f' });
    await handleProgressEvent({ ...event, entityType: 'category' });

    expect(await XpGrant.countDocuments({ userId })).toBe(1);
    const progress = await progressOf(user);
    expect(progress.xp.total).toBe(5);
    expect(unlockedKeys(progress)).toEqual(['task_first']);
    // An unlock is announced to the user's devices exactly once.
    expect(await SyncEvent.countDocuments({ userId, type: 'achievement.created' })).toBe(1);
  });

  it('counts what an account recorded before it had a progress record', async () => {
    setClock();
    const user = await registerUser();
    const task = await post(user, '/tasks', { title: 'Old task', priority: 'high' });
    await user.post(`/tasks/${task.id}/complete`).expect(200);
    await user.put(`/mood/${TODAY}`, { score: 4 }).expect(200);
    const habit = await post(user, '/habits', {
      name: 'Read',
      color: '#0a84ff',
      startDate: '2026-11-22',
    });
    for (const date of ['2026-11-22', '2026-11-23', TODAY]) {
      await user.put(`/habits/${habit.id}/entries/${date}`, { value: 1 }).expect(200);
    }
    await expectXp(user, 42);

    // As if these records were older than the progress system.
    const userId = (await user.get('/users/me').expect(200)).body.data.user.id;
    await XpGrant.deleteMany({ userId });
    await UserProgress.deleteOne({ _id: userId });

    const progress = await progressOf(user);
    expect(progress.xp.total).toBe(42);
    expect(progress.achievements.find((item) => item.key === 'streak_7').current).toBe(3);
    expect((await UserProgress.findById(userId)).backfilledAt).toBeInstanceOf(Date);
  });

  it('cannot be granted by a client and stays with its account', async () => {
    setClock();
    const user = await registerUser();
    const other = await registerUser();
    const task = await post(user, '/tasks', { title: 'Mine' });
    await user.post(`/tasks/${task.id}/complete`).expect(200);
    await expectXp(user, 5);

    expect((await progressOf(other)).xp.total).toBe(0);
    expect(unlockedKeys(await progressOf(other))).toEqual([]);
    await user.post('/achievements', { key: 'level_10' }).expect(404);
    await user.patch('/achievements', { xp: 5000 }).expect(404);

    const exported = (await user.get('/account/export').expect(200)).body.data.data;
    expect(exported.xpGrants).toMatchObject([{ rule: 'task_completed', amount: 5 }]);
    expect(exported.achievement).toMatchObject([{ key: 'task_first' }]);
    const theirs = (await other.get('/account/export').expect(200)).body.data.data;
    expect(theirs.xpGrants).toEqual([]);
    expect(theirs.achievement).toEqual([]);
  });
});
