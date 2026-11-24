import {
  ANNOUNCEMENT_TONES,
  APP_IDS,
  PLATFORMS,
  RELEASE_CHANNELS,
  RELEASE_PLATFORM_ANY,
  isValidVersion,
} from '@personalitify/shared-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { Button, IconButton } from '../../ui/Button.jsx';
import { Badge, Panel } from '../../ui/display.jsx';
import { ErrorState, SkeletonList } from '../../ui/feedback.jsx';
import { Field, Input, Select, Switch, Textarea } from '../../ui/fields.jsx';
import { Modal } from '../../ui/overlays.jsx';
import { useToast } from '../../ui/toast.jsx';

/** Refreshes what administrators and everyone else see after a configuration change. */
function useConfigMutation(mutationFn, message) {
  const { t } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.config });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.config });
      toast.success(message ?? t('platform:admin.saved'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function AnnouncementForm({ entry }) {
  const { t } = useTranslation();
  const stored = entry.overridden ? entry.value : null;
  const [enabled, setEnabled] = useState(entry.overridden && entry.enabled);
  const [tone, setTone] = useState(stored?.tone ?? 'info');
  const [tr, setTr] = useState(stored?.message.tr ?? '');
  const [en, setEn] = useState(stored?.message.en ?? '');
  const [incomplete, setIncomplete] = useState(false);

  const save = useConfigMutation(() => {
    const message = { tr: tr.trim(), en: en.trim() };
    const unchanged =
      stored && stored.message.tr === message.tr && stored.message.en === message.en;
    return api.admin.setConfig('announcement', {
      // A new id makes the message appear again for people who dismissed the old one.
      value: { id: unchanged ? stored.id : `announcement-${Date.now()}`, tone, message },
      enabled,
    });
  });
  const remove = useConfigMutation(
    () => api.admin.resetConfig('announcement'),
    t('platform:admin.announcement.removed'),
  );

  const submit = (event) => {
    event.preventDefault();
    if (!tr.trim() || !en.trim()) {
      setIncomplete(true);
      return;
    }
    setIncomplete(false);
    save.mutate();
  };

  return (
    <Panel
      title={t('platform:admin.announcement.title')}
      description={t('platform:admin.announcement.description')}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Switch
          checked={enabled}
          onChange={setEnabled}
          label={t('platform:admin.announcement.enabled')}
        />
        <Field label={t('platform:admin.announcement.tone')} className="max-w-xs">
          {(control) => (
            <Select
              {...control}
              value={tone}
              onChange={(event) => setTone(event.target.value)}
              options={ANNOUNCEMENT_TONES.map((value) => ({
                value,
                label: t(`platform:admin.announcement.tones.${value}`),
              }))}
            />
          )}
        </Field>
        <Field label={t('platform:admin.announcement.messageTr')}>
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              maxLength={500}
              value={tr}
              onChange={(event) => setTr(event.target.value)}
            />
          )}
        </Field>
        <Field
          label={t('platform:admin.announcement.messageEn')}
          error={incomplete ? t('platform:admin.announcement.bothRequired') : undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              maxLength={500}
              value={en}
              onChange={(event) => setEn(event.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap justify-between gap-2">
          {entry.overridden ? (
            <Button
              variant="danger-ghost"
              loading={remove.isPending}
              disabled={save.isPending}
              onClick={() => remove.mutate()}
            >
              {t('platform:admin.announcement.remove')}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" type="submit" loading={save.isPending}>
            {t('platform:admin.announcement.save')}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function RegistrationSwitch({ entry }) {
  const { t } = useTranslation();
  const open = entry.overridden && entry.enabled ? entry.value : entry.defaultValue;
  const change = useConfigMutation((value) => api.admin.setConfig('registrationOpen', { value }));
  return (
    <Panel title={t('platform:admin.registration.title')}>
      <Switch
        checked={open}
        disabled={change.isPending}
        onChange={(value) => change.mutate(value)}
        label={t('platform:admin.registration.open')}
        description={t('platform:admin.registration.openDescription')}
      />
    </Panel>
  );
}

const EMPTY_RELEASE = {
  appId: APP_IDS.DESKTOP,
  platform: RELEASE_PLATFORM_ANY,
  channel: 'stable',
  version: '',
  minSupportedVersion: '',
  rolloutPercent: 100,
  downloadUrl: '',
  notesTr: '',
  notesEn: '',
  mandatory: false,
  published: false,
};

function ReleaseDialog({ onClose }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(EMPTY_RELEASE);
  const [checked, setChecked] = useState(false);
  const set = (name) => (event) =>
    setValues((current) => ({ ...current, [name]: event.target.value }));

  const versionValid = isValidVersion(values.version);
  const minValid = values.minSupportedVersion === '' || isValidVersion(values.minSupportedVersion);
  const urlValid = values.downloadUrl === '' || values.downloadUrl.startsWith('https://');

  const create = useMutation({
    mutationFn: () =>
      api.admin.createRelease({
        appId: values.appId,
        platform: values.platform,
        channel: values.channel,
        version: values.version,
        minSupportedVersion: values.minSupportedVersion || null,
        rolloutPercent: Number(values.rolloutPercent),
        downloadUrl: values.downloadUrl || null,
        notes: { tr: values.notesTr.trim(), en: values.notesEn.trim() },
        mandatory: values.mandatory,
        published: values.published,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.releases });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.update });
      toast.success(t('platform:admin.releases.created'));
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submit = (event) => {
    event.preventDefault();
    setChecked(true);
    if (versionValid && minValid && urlValid) create.mutate();
  };
  const invalidVersion = t('platform:admin.releases.versionInvalid');
  const choices = (name, list) =>
    list.map((value) => ({ value, label: t(`platform:admin.releases.${name}.${value}`) }));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('platform:admin.releases.addTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button variant="primary" type="submit" form="release-form" loading={create.isPending}>
            {t('platform:admin.releases.create')}
          </Button>
        </>
      }
    >
      <form id="release-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label={t('platform:admin.releases.app')}>
          {(control) => (
            <Select
              {...control}
              value={values.appId}
              onChange={set('appId')}
              options={choices('apps', Object.values(APP_IDS))}
            />
          )}
        </Field>
        <Field label={t('platform:admin.releases.platform')}>
          {(control) => (
            <Select
              {...control}
              value={values.platform}
              onChange={set('platform')}
              options={choices('platforms', [RELEASE_PLATFORM_ANY, ...PLATFORMS])}
            />
          )}
        </Field>
        <Field
          label={t('platform:admin.releases.version')}
          hint={t('platform:admin.releases.versionHint')}
          error={checked && !versionValid ? invalidVersion : undefined}
        >
          {(control) => (
            <Input
              {...control}
              value={values.version}
              onChange={set('version')}
              inputMode="decimal"
            />
          )}
        </Field>
        <Field label={t('platform:admin.releases.channel')}>
          {(control) => (
            <Select
              {...control}
              value={values.channel}
              onChange={set('channel')}
              options={choices('channels', RELEASE_CHANNELS)}
            />
          )}
        </Field>
        <Field
          label={t('platform:admin.releases.minSupportedVersion')}
          optional
          error={checked && !minValid ? invalidVersion : undefined}
        >
          {(control) => (
            <Input
              {...control}
              value={values.minSupportedVersion}
              onChange={set('minSupportedVersion')}
              inputMode="decimal"
            />
          )}
        </Field>
        <Field label={t('platform:admin.releases.rolloutPercent')}>
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              max={100}
              step={1}
              value={values.rolloutPercent}
              onChange={set('rolloutPercent')}
            />
          )}
        </Field>
        <Field
          label={t('platform:admin.releases.downloadUrl')}
          optional
          hint={t('platform:admin.releases.downloadUrlHint')}
          error={checked && !urlValid ? t('platform:admin.releases.downloadUrlHint') : undefined}
          className="sm:col-span-2"
        >
          {(control) => (
            <Input
              {...control}
              type="url"
              value={values.downloadUrl}
              onChange={set('downloadUrl')}
            />
          )}
        </Field>
        <Field label={t('platform:admin.releases.notesTr')} optional>
          {(control) => (
            <Textarea {...control} rows={3} value={values.notesTr} onChange={set('notesTr')} />
          )}
        </Field>
        <Field label={t('platform:admin.releases.notesEn')} optional>
          {(control) => (
            <Textarea {...control} rows={3} value={values.notesEn} onChange={set('notesEn')} />
          )}
        </Field>
        <Switch
          checked={values.mandatory}
          onChange={(mandatory) => setValues((current) => ({ ...current, mandatory }))}
          label={t('platform:admin.releases.mandatoryLabel')}
        />
        <Switch
          checked={values.published}
          onChange={(published) => setValues((current) => ({ ...current, published }))}
          label={t('platform:admin.releases.publishNow')}
        />
      </form>
    </Modal>
  );
}

function Releases() {
  const { t } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const releases = useQuery({
    queryKey: queryKeys.admin.releases,
    queryFn: () => api.admin.listReleases(),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.releases });
    queryClient.invalidateQueries({ queryKey: queryKeys.platform.update });
  };
  const onError = (error) => toast.error(errorMessage(error));
  const setPublished = useMutation({
    mutationFn: ({ id, published }) => api.admin.updateRelease(id, { published }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id) => api.admin.removeRelease(id),
    onSuccess: () => {
      toast.success(t('platform:admin.releases.deleted'));
      refresh();
    },
    onError,
  });

  return (
    <Panel
      title={t('platform:admin.releases.title')}
      description={t('platform:admin.releases.description')}
      actions={
        <Button icon={Plus} onClick={() => setAdding(true)}>
          {t('platform:admin.releases.add')}
        </Button>
      }
    >
      {releases.isPending ? (
        <SkeletonList rows={2} />
      ) : releases.isError ? (
        <ErrorState description={errorMessage(releases.error)} onRetry={releases.refetch} />
      ) : releases.data.length === 0 ? (
        <p className="py-2 text-body text-ink-2">{t('platform:admin.releases.empty')}</p>
      ) : (
        <ul className="flex flex-col">
          {releases.data.map((release) => (
            <li
              key={release.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
                  <span>
                    {t(`platform:admin.releases.apps.${release.appId}`)} {release.version}
                  </span>
                  <Badge tone={release.published ? 'success' : 'neutral'}>
                    {t(
                      release.published
                        ? 'platform:admin.releases.published'
                        : 'platform:admin.releases.draft',
                    )}
                  </Badge>
                  {release.mandatory && (
                    <Badge tone="warning">{t('platform:admin.releases.mandatory')}</Badge>
                  )}
                </p>
                <p className="mt-0.5 text-caption text-ink-2">
                  {[
                    t(`platform:admin.releases.platforms.${release.platform}`),
                    t(`platform:admin.releases.channels.${release.channel}`),
                    t('platform:admin.releases.rollout', { value: release.rolloutPercent }),
                    release.minSupportedVersion &&
                      t('platform:admin.releases.minSupported', {
                        version: release.minSupportedVersion,
                      }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Button
                size="sm"
                aria-label={t(
                  release.published
                    ? 'platform:admin.releases.withdraw'
                    : 'platform:admin.releases.publish',
                  { version: release.version },
                )}
                disabled={setPublished.isPending}
                onClick={() =>
                  setPublished.mutate({ id: release.id, published: !release.published })
                }
              >
                {t(
                  release.published
                    ? 'platform:admin.releases.withdrawAction'
                    : 'platform:admin.releases.publishAction',
                )}
              </Button>
              <IconButton
                icon={Trash2}
                size="sm"
                label={t('platform:admin.releases.delete', { version: release.version })}
                disabled={remove.isPending}
                onClick={() => remove.mutate(release.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {adding && <ReleaseDialog onClose={() => setAdding(false)} />}
    </Panel>
  );
}

/** Settings that affect the whole installation. Rendered for administrators only. */
export function AdminSection() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const config = useQuery({
    queryKey: queryKeys.admin.config,
    queryFn: () => api.admin.listConfig(),
  });
  const entry = (key) => config.data.find((item) => item.key === key);

  return (
    <>
      <p className="text-body text-ink-2">{t('platform:admin.description')}</p>
      {config.isPending ? (
        <SkeletonList rows={3} />
      ) : config.isError ? (
        <ErrorState description={errorMessage(config.error)} onRetry={config.refetch} />
      ) : (
        <>
          <AnnouncementForm
            key={entry('announcement').updatedAt ?? 'default'}
            entry={entry('announcement')}
          />
          <RegistrationSwitch entry={entry('registrationOpen')} />
        </>
      )}
      <Releases />
    </>
  );
}
