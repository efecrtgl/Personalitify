import {
  Bell,
  Wrench,
  Clock,
  EyeOff,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  UserRound,
  UserRoundX,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, useParams } from 'react-router';
import { cn } from '../../lib/cn.js';
import { PageHeader } from '../../ui/display.jsx';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { AccountSection } from './AccountSection.jsx';
import { AdminSection } from './AdminSection.jsx';
import { AppearanceSection } from './AppearanceSection.jsx';
import { DevicesSection } from './DevicesSection.jsx';
import { NotificationsSection } from './NotificationsSection.jsx';
import { PrivacySection } from './PrivacySection.jsx';
import { ProfileSection } from './ProfileSection.jsx';
import { RegionSection } from './RegionSection.jsx';
import { SecuritySection } from './SecuritySection.jsx';

const SECTIONS = [
  { id: 'profile', icon: UserRound, component: ProfileSection },
  { id: 'appearance', icon: Palette, component: AppearanceSection },
  { id: 'region', icon: Clock, component: RegionSection },
  { id: 'notifications', icon: Bell, component: NotificationsSection },
  { id: 'privacy', icon: EyeOff, component: PrivacySection },
  { id: 'security', icon: ShieldCheck, component: SecuritySection },
  { id: 'devices', icon: MonitorSmartphone, component: DevicesSection },
  { id: 'account', icon: UserRoundX, component: AccountSection },
  // Shown to administrators only; the server enforces the role on every request.
  { id: 'admin', icon: Wrench, component: AdminSection, adminOnly: true },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const { section } = useParams();
  const { user } = useAuth();
  const sections = SECTIONS.filter((entry) => !entry.adminOnly || user.role === 'admin');
  const active = sections.find((entry) => entry.id === section);

  if (!active) {
    return <Navigate to={`/settings/${sections[0].id}`} replace />;
  }
  const ActiveSection = active.component;

  return (
    <>
      <PageHeader title={t('settings:title')} description={t('settings:description')} />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <nav
          aria-label={t('settings:sectionsLabel')}
          className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:sticky lg:top-24 lg:mx-0 lg:w-52 lg:shrink-0 lg:overflow-visible lg:px-0"
        >
          <ul className="flex gap-1 lg:flex-col">
            {sections.map(({ id, icon: Icon }) => (
              <li key={id} className="shrink-0">
                <NavLink
                  to={`/settings/${id}`}
                  className={({ isActive }) =>
                    cn(
                      'flex h-10 items-center gap-2.5 rounded-control px-3 text-body font-medium whitespace-nowrap transition-colors duration-150',
                      isActive
                        ? 'bg-surface text-ink shadow-card ring-1 ring-line'
                        : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {t(`settings:sections.${id}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <ActiveSection />
        </div>
      </div>
    </>
  );
}
