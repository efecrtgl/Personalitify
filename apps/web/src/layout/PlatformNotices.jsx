import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandMark } from './Brand.jsx';
import { useRemoteConfig, useUpdateCheck } from '../lib/platform.js';
import { readStored, writeStored } from '../lib/storage.js';
import { Button } from '../ui/Button.jsx';
import { Banner } from '../ui/feedback.jsx';

const reload = () => window.location.reload();

/** The release notes in the interface language, falling back to the other one. */
function notesOf(latest, language) {
  const primary = language === 'tr' ? latest.notes.tr : latest.notes.en;
  return primary || latest.notes.en || latest.notes.tr || '';
}

/**
 * A message from whoever runs this installation, shown to everyone until they dismiss it.
 * A message with a new id is shown again.
 */
export function AnnouncementBanner() {
  const { t, i18n } = useTranslation();
  const { announcement } = useRemoteConfig();
  const [dismissed, setDismissed] = useState(() => readStored('dismissedAnnouncement'));

  if (!announcement || dismissed === announcement.id) return null;
  const message =
    (i18n.language === 'tr' ? announcement.message.tr : announcement.message.en) ||
    announcement.message.en ||
    announcement.message.tr;

  return (
    <Banner
      tone={announcement.tone === 'warning' ? 'warning' : 'info'}
      title={t('platform:announcement.label')}
      className="mb-5"
      onDismiss={() => {
        writeStored('dismissedAnnouncement', announcement.id);
        setDismissed(announcement.id);
      }}
    >
      {message}
    </Banner>
  );
}

/** Tells the user that a newer version has been published and offers to load it. */
export function UpdateBanner() {
  const { t, i18n } = useTranslation();
  const update = useUpdateCheck();
  const [postponed, setPostponed] = useState(null);

  if (!update?.updateAvailable || update.mandatory) return null;
  if (postponed === update.latest.version) return null;
  const notes = notesOf(update.latest, i18n.language);

  return (
    <Banner
      tone="info"
      title={t('platform:update.available', { version: update.latest.version })}
      className="mb-5"
      action={
        <Button size="sm" variant="primary" onClick={reload}>
          {t('platform:update.reload')}
        </Button>
      }
      onDismiss={() => setPostponed(update.latest.version)}
    >
      {notes}
    </Banner>
  );
}

/**
 * When the running version is no longer supported, nothing else is shown: working on in a
 * version the server has moved away from would only produce errors.
 */
export function RequiredUpdateGate({ children }) {
  const { t, i18n } = useTranslation();
  const update = useUpdateCheck();
  if (!update?.mandatory) return children;

  const notes = update.latest ? notesOf(update.latest, i18n.language) : '';
  return (
    <div
      role="alertdialog"
      aria-labelledby="required-update-title"
      aria-describedby="required-update-description"
      className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center"
    >
      <BrandMark className="size-12" />
      <div className="max-w-md">
        <h1 id="required-update-title" className="text-title font-semibold text-ink">
          {t('platform:update.requiredTitle')}
        </h1>
        <p id="required-update-description" className="mt-2 text-body text-ink-2">
          {t('platform:update.requiredDescription')}
        </p>
        {update.latest && (
          <p className="mt-3 text-caption text-ink-2">
            {t('platform:update.requiredVersion', { version: update.latest.version })}
          </p>
        )}
        {notes && (
          <div className="mt-4 rounded-control bg-surface-2 p-4 text-left">
            <p className="text-caption font-medium text-ink-2">{t('platform:update.notes')}</p>
            <p className="mt-1 text-body whitespace-pre-line text-ink">{notes}</p>
          </div>
        )}
      </div>
      <Button variant="primary" size="lg" onClick={reload}>
        {t('platform:update.reload')}
      </Button>
    </div>
  );
}
