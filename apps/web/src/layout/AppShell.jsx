import { LogOut, Menu as MenuIcon, Settings, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { cn } from '../lib/cn.js';
import { useFormat } from '../lib/format.js';
import { useAuth } from '../providers/AuthProvider.jsx';
import { IconButton } from '../ui/Button.jsx';
import { Avatar } from '../ui/display.jsx';
import { Menu } from '../ui/overlays.jsx';
import { Brand } from './Brand.jsx';
import { EmailVerificationBanner } from './EmailVerificationBanner.jsx';
import { primaryNavigation, secondaryNavigation } from './navigation.js';
import { ThemeMenu } from './PreferenceMenus.jsx';

function NavItem({ item, onNavigate }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-10 items-center gap-3 rounded-control px-3 text-body font-medium transition-colors duration-150',
          isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{t(item.labelKey)}</span>
    </NavLink>
  );
}

function SidebarContent({ onNavigate }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex h-16 shrink-0 items-center px-5">
        <Brand />
      </div>
      <nav
        aria-label={t('common:nav.primary')}
        className="flex flex-1 flex-col overflow-y-auto px-3 pb-4"
      >
        <ul className="flex flex-col gap-1">
          {primaryNavigation.map((item) => (
            <li key={item.to}>
              <NavItem item={item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        <ul className="mt-auto flex flex-col gap-1 pt-4">
          {secondaryNavigation.map((item) => (
            <li key={item.to}>
              <NavItem item={item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/** Off-canvas navigation for narrow screens, with modal dialog semantics. */
function MobileDrawer({ open, onClose }) {
  const ref = useRef(null);
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={t('common:nav.primary')}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-surface p-0 text-ink shadow-pop backdrop:bg-overlay open:animate-[pfy-drawer-in_200ms_var(--ease-standard)] lg:hidden"
    >
      {open && (
        <div className="flex h-full flex-col">
          <IconButton
            icon={X}
            label={t('common:nav.closeMenu')}
            onClick={onClose}
            className="absolute top-3 right-3"
          />
          <SidebarContent onNavigate={onClose} />
        </div>
      )}
    </dialog>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const { profile, user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <Menu
      label={t('common:userMenu.label')}
      trigger={
        <button
          type="button"
          aria-label={t('common:userMenu.label')}
          className="flex items-center gap-2 rounded-full p-0.5 transition-opacity hover:opacity-85"
        >
          <Avatar
            name={profile?.displayName ?? user?.email}
            color={profile?.avatarColor}
            size="sm"
          />
        </button>
      }
      items={[
        {
          id: 'profile',
          label: t('common:userMenu.profile'),
          icon: UserRound,
          onSelect: () => navigate('/settings/profile'),
        },
        {
          id: 'settings',
          label: t('common:userMenu.settings'),
          icon: Settings,
          onSelect: () => navigate('/settings'),
        },
        { separator: true },
        { id: 'logout', label: t('common:userMenu.signOut'), icon: LogOut, onSelect: logout },
      ]}
    />
  );
}

function Topbar({ onOpenMenu }) {
  const { t } = useTranslation();
  const format = useFormat();
  const [now, setNow] = useState(() => new Date());

  // Keep the date correct for a tab that stays open across midnight.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <IconButton
        icon={MenuIcon}
        label={t('common:nav.openMenu')}
        onClick={onOpenMenu}
        className="-ml-2 lg:hidden"
      />
      <p className="min-w-0 flex-1 truncate text-body font-medium text-ink-2 first-letter:uppercase">
        <time dateTime={now.toISOString()}>{format.weekdayDate(now)}</time>
      </p>
      <ThemeMenu />
      <UserMenu />
    </header>
  );
}

/** Frame of the signed-in application: sidebar, top bar and the routed page. */
export function AppShell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);

  // After navigation, move focus to the page so keyboard and screen reader users land on
  // the new content instead of staying on the link they activated.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:shadow-pop"
      >
        {t('common:nav.skipToContent')}
      </a>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <SidebarContent />
      </aside>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setDrawerOpen(true)} />
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8"
        >
          {user && !user.emailVerified && <EmailVerificationBanner />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
