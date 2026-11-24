import { ACHIEVEMENT_GROUPS, FOCUS_XP_CAP, XP_RULES } from '@personalitify/shared-contracts';
import { useQuery } from '@tanstack/react-query';
import { Lock, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { cn } from '../../lib/cn.js';
import { useFormat } from '../../lib/format.js';
import { Badge, Card, PageHeader, Panel } from '../../ui/display.jsx';
import { ErrorState, Skeleton } from '../../ui/feedback.jsx';

function Bar({ value, max, label, className }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn('h-2 overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div
        className="h-full rounded-full bg-accent"
        style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }}
      />
    </div>
  );
}

function LevelCard({ data }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { level, xp } = data;
  const span = level.nextLevelXp - level.levelXp;
  const figures = [
    ['total', xp.total],
    ['today', xp.today],
    ['week', xp.week],
  ];
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-display font-semibold text-ink">
            {t('achievements:level.title', { level: level.level })}
          </h2>
          <p className="mt-1 text-body text-ink-2">
            {t('achievements:level.needed', { count: level.needed })}
          </p>
        </div>
        <dl className="flex gap-6">
          {figures.map(([name, value]) => (
            <div key={name}>
              <dt className="text-caption text-ink-2">{t(`achievements:level.${name}`)}</dt>
              <dd className="text-heading font-semibold text-ink tabular-nums">
                {t('achievements:level.xp', { value: format.number(value) })}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <Bar
        value={level.intoLevel}
        max={span}
        label={t('achievements:level.progressLabel', { level: level.level })}
        className="mt-5 h-3"
      />
      <p className="mt-2 flex flex-wrap justify-between gap-2 text-caption text-ink-2">
        <span className="tabular-nums">
          {t('achievements:level.progress', {
            current: format.number(level.intoLevel),
            target: format.number(span),
          })}
        </span>
        <span>{t('achievements:level.explain')}</span>
      </p>
    </Card>
  );
}

function AchievementCard({ achievement }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { key, unlocked, metric } = achievement;
  const name = t(`achievements:items.${key}.name`);
  // Focus time is measured in seconds and shown in whole hours.
  const hours = metric === 'focusSeconds';
  const current = hours ? Math.floor(achievement.current / 3600) : achievement.current;
  const target = hours ? achievement.target / 3600 : achievement.target;
  const Icon = unlocked ? Trophy : Lock;
  return (
    <li
      className={cn(
        'flex gap-3 rounded-card p-4 ring-1',
        unlocked ? 'bg-accent-soft ring-accent/30' : 'bg-surface ring-line',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          unlocked ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink-3',
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-body font-semibold text-ink">{name}</h4>
          <Badge tone={unlocked ? 'accent' : 'neutral'}>
            {t(unlocked ? 'achievements:state.unlocked' : 'achievements:state.locked')}
          </Badge>
        </div>
        <p className="mt-0.5 text-caption text-ink-2">
          {t(`achievements:items.${key}.description`)}
        </p>
        {unlocked ? (
          <p className="mt-2 text-caption text-ink-2">
            {t('achievements:state.unlockedOn', { date: format.date(achievement.unlockedAt) })}
          </p>
        ) : (
          <div className="mt-2 flex items-center gap-3">
            <Bar
              value={achievement.current}
              max={achievement.target}
              label={t('achievements:state.progressLabel', { name })}
              className="flex-1"
            />
            <span className="shrink-0 text-caption text-ink-2 tabular-nums">
              {t(hours ? 'achievements:state.hours' : 'achievements:state.value', {
                current: format.number(current),
                target: format.number(target),
              })}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

export function AchievementsPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const progress = useQuery({
    queryKey: queryKeys.achievements,
    queryFn: () => api.achievements.get(),
  });
  const data = progress.data;

  return (
    <>
      <PageHeader title={t('achievements:title')} description={t('achievements:description')} />
      {progress.isPending ? (
        <div className="flex flex-col gap-5">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
        </div>
      ) : progress.isError ? (
        <ErrorState description={errorMessage(progress.error)} onRetry={progress.refetch} />
      ) : (
        <div className="flex flex-col gap-5">
          <LevelCard data={data} />

          <Panel
            title={t('achievements:title')}
            description={t('achievements:summary', {
              count: data.achievements.filter((item) => item.unlocked).length,
              total: data.achievements.length,
            })}
          >
            <div className="flex flex-col gap-6">
              {ACHIEVEMENT_GROUPS.map((group) => {
                const items = data.achievements.filter((item) => item.group === group);
                if (items.length === 0) return null;
                return (
                  <section key={group} aria-labelledby={`achievement-group-${group}`}>
                    <h3
                      id={`achievement-group-${group}`}
                      className="mb-3 text-caption font-medium text-ink-2"
                    >
                      {t(`achievements:group.${group}`)}
                    </h3>
                    <ul className="grid gap-3 md:grid-cols-2">
                      {items.map((achievement) => (
                        <AchievementCard key={achievement.key} achievement={achievement} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </Panel>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Panel
              title={t('achievements:rules.title')}
              description={t('achievements:rules.description')}
            >
              <ul className="flex flex-col">
                {Object.entries(XP_RULES).map(([rule, amount]) => (
                  <li
                    key={rule}
                    className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-body first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <span className="text-ink-2">
                      {t(`achievements:rules.${rule}`, { cap: FOCUS_XP_CAP })}
                    </span>
                    <span className="shrink-0 font-medium text-ink tabular-nums">
                      {t('achievements:rules.amount', { value: amount })}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={t('achievements:recent.title')}>
              {data.recent.length === 0 ? (
                <p className="py-2 text-body text-ink-2">{t('achievements:recent.empty')}</p>
              ) : (
                <ul className="flex flex-col">
                  {data.recent.map((grant) => (
                    <li
                      key={grant.id}
                      className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-body first:pt-0 last:border-b-0 last:pb-0"
                    >
                      <span className="min-w-0">
                        <span className="text-ink">{t(`achievements:recent.${grant.rule}`)}</span>
                        <span className="ml-2 text-caption text-ink-3">
                          {format.calendarShortDate(grant.date)}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium text-ink tabular-nums">
                        {t('achievements:rules.amount', { value: grant.amount })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
