import { Palette, ShieldCheck, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '../providers/AuthProvider.jsx';
import { Card, PageHeader } from '../ui/display.jsx';

/** Which greeting fits the hour in the user's own time zone. */
export function greetingKey(date, timeZone) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone }).format(date),
  );
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

const SHORTCUTS = [
  { to: '/settings/profile', icon: UserRound, key: 'profile' },
  { to: '/settings/appearance', icon: Palette, key: 'appearance' },
  { to: '/settings/security', icon: ShieldCheck, key: 'security' },
];

/**
 * Landing page of the signed-in application. The personal dashboard replaces it once the
 * modules it summarizes exist; until then it offers the things that can already be done.
 */
export function HomePage() {
  const { t } = useTranslation();
  const { profile, settings } = useAuth();
  const period = greetingKey(new Date(), settings?.timeZone);

  return (
    <>
      <PageHeader
        title={t(`home:greeting.${period}`, { name: profile?.displayName })}
        description={t('home:intro')}
      />
      <h2 className="mb-3 text-heading font-semibold text-ink">{t('home:shortcuts.title')}</h2>
      <ul className="grid gap-4 sm:grid-cols-3">
        {SHORTCUTS.map(({ to, icon: Icon, key }) => (
          <li key={key}>
            <Link to={to} className="group block h-full rounded-card">
              <Card
                as="div"
                className="flex h-full flex-col gap-3 p-5 transition-shadow duration-200 group-hover:shadow-raised"
              >
                <span className="flex size-10 items-center justify-center rounded-control bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-body font-semibold text-ink">
                    {t(`home:shortcuts.${key}.title`)}
                  </span>
                  <span className="mt-0.5 block text-caption text-ink-2">
                    {t(`home:shortcuts.${key}.description`)}
                  </span>
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
