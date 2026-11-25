import { useTranslation } from 'react-i18next';
import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { PageFallback } from '../ui/feedback.jsx';
import { Card } from '../ui/display.jsx';
import { Brand } from './Brand.jsx';
import { LanguageMenu, ThemeMenu } from './PreferenceMenus.jsx';

/** Frame of the signed-out screens: brand, language and theme controls, one centered card. */
export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <Brand />
        <div className="flex items-center gap-1">
          <LanguageMenu />
          <ThemeMenu />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Card as="div" className="p-6 shadow-raised sm:p-8">
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </Card>
          <p className="mt-6 text-center text-caption text-ink-3">{t('common:app.tagline')}</p>
        </div>
      </main>
    </div>
  );
}

/** Heading block shared by the forms inside the auth card. */
export function AuthHeading({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="text-title font-semibold text-ink">{title}</h1>
      {subtitle && <p className="mt-1.5 text-body text-ink-2">{subtitle}</p>}
    </div>
  );
}
