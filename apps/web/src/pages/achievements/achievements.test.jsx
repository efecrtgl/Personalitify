import { ACHIEVEMENTS, levelProgress } from '@personalitify/shared-contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fail, mockApi, ok, renderApp, signedInRoutes } from '../../test/harness.jsx';

/** Progress as the API returns it; `current` holds the figures of achievements under way. */
function progress({
  total = 0,
  today = 0,
  week = 0,
  current = {},
  unlocked = {},
  recent = [],
} = {}) {
  return {
    today: '2026-11-24',
    xp: { total, today, week },
    level: levelProgress(total),
    achievements: ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
      current: unlocked[achievement.key] ? achievement.target : (current[achievement.key] ?? 0),
      unlocked: Boolean(unlocked[achievement.key]),
      unlockedAt: unlocked[achievement.key] ?? null,
    })),
    recent,
  };
}

describe('achievements', () => {
  it('shows the level, XP and how far the next level is', async () => {
    mockApi({
      ...signedInRoutes(),
      'GET /achievements': () => ok(progress({ total: 150, today: 25, week: 90 })),
    });
    renderApp('/');
    await userEvent.click(await screen.findByRole('link', { name: 'Başarılar' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Seviye 2' })).toBeInTheDocument();
    expect(screen.getByText('Sonraki seviyeye 150 XP')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Seviye 2 ilerlemesi' });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemax', '200');
    expect(screen.getByText('50 / 200 XP')).toBeInTheDocument();
    expect(screen.getByText('150 XP')).toBeInTheDocument();
    expect(screen.getByText('25 XP')).toBeInTheDocument();
    expect(screen.getByText('90 XP')).toBeInTheDocument();
  });

  it('lists every achievement by group with its state and progress', async () => {
    mockApi({
      ...signedInRoutes(),
      'GET /achievements': () =>
        ok(
          progress({
            total: 150,
            unlocked: {
              habit_first: '2026-11-20T09:00:00.000Z',
              task_first: '2026-11-21T09:00:00.000Z',
            },
            current: { habit_100: 12, streak_7: 4, focus_10h: 9000, level_5: 2 },
          }),
        ),
    });
    renderApp('/achievements');

    expect(await screen.findByText('21 başarıdan 2 tanesi açıldı')).toBeInTheDocument();
    for (const group of [
      'Alışkanlıklar',
      'Görevler',
      'Hedefler',
      'Odak',
      'Günlük',
      'Ruh hali',
      'Seviye',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: group })).toBeInTheDocument();
    }

    const first = screen.getByRole('heading', { name: 'İlk adım' }).closest('li');
    expect(within(first).getByText('Açıldı')).toBeInTheDocument();
    expect(within(first).getByText('20 Kasım 2026 tarihinde açıldı')).toBeInTheDocument();
    expect(within(first).queryByRole('progressbar')).not.toBeInTheDocument();

    const hundred = screen.getByRole('heading', { name: 'Yüz gün' }).closest('li');
    expect(within(hundred).getByText('Kilitli')).toBeInTheDocument();
    expect(within(hundred).getByText('12 / 100')).toBeInTheDocument();
    expect(
      within(hundred).getByRole('progressbar', { name: 'Yüz gün ilerlemesi' }),
    ).toHaveAttribute('aria-valuenow', '12');

    // Focus time is counted in seconds and shown in hours.
    const focus = screen.getByRole('heading', { name: 'On saat odak' }).closest('li');
    expect(within(focus).getByText('2 / 10 saat')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((item) => item.querySelector('h4'))).toHaveLength(
      ACHIEVEMENTS.length,
    );
  });

  it('states the rules with their real amounts and lists what was earned', async () => {
    mockApi({
      ...signedInRoutes(),
      'GET /achievements': () =>
        ok(
          progress({
            total: 14,
            recent: [
              {
                id: 'grant-2',
                rule: 'focus_block',
                amount: 4,
                entityType: 'focusSession',
                entityId: 'session-1',
                date: '2026-11-24',
                grantedAt: '2026-11-24T09:10:00.000Z',
              },
              {
                id: 'grant-1',
                rule: 'task_completed_high',
                amount: 10,
                entityType: 'task',
                entityId: 'task-1',
                date: '2026-11-23',
                grantedAt: '2026-11-23T09:00:00.000Z',
              },
            ],
          }),
        ),
    });
    renderApp('/achievements');

    const rules = (await screen.findByRole('heading', { name: 'XP nasıl kazanılır?' })).closest(
      'section',
    );
    const rows = within(rules).getAllByRole('listitem');
    expect(rows).toHaveLength(8);
    expect(rows[0]).toHaveTextContent('Bir alışkanlığı o gün için tamamlamak+10 XP');
    expect(rows[4]).toHaveTextContent('Bir hedefi tamamlamak+50 XP');
    expect(rows[5]).toHaveTextContent(
      'Tamamlanan odak oturumunun her 5 dakikası (oturum başına en fazla 24 XP)+2 XP',
    );

    const recent = screen.getByRole('heading', { name: 'Son kazanılanlar' }).closest('section');
    const earned = within(recent).getAllByRole('listitem');
    expect(earned[0]).toHaveTextContent('Odak oturumu24 Kas+4 XP');
    expect(earned[1]).toHaveTextContent('Yüksek öncelikli görev bitirildi23 Kas+10 XP');
  });

  it('invites a new account to start and offers a retry on failure', async () => {
    let failing = true;
    mockApi({
      ...signedInRoutes(),
      'GET /achievements': () => (failing ? fail(500, 'INTERNAL_ERROR') : ok(progress())),
    });
    renderApp('/achievements');

    const retry = await screen.findByRole('button', { name: 'Yeniden dene' });
    failing = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('heading', { level: 2, name: 'Seviye 1' })).toBeInTheDocument();
    expect(screen.getByText('21 başarıdan 0 tanesi açıldı')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Henüz XP kazanılmadı. Bir alışkanlığı tamamlayarak ya da bir görevi bitirerek başlayın.',
      ),
    ).toBeInTheDocument();
  });
});
