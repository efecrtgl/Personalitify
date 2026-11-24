import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Laptop, Pencil, Plug, Smartphone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { rules, useForm } from '../../hooks/useForm.js';
import { api, queryKeys } from '../../lib/api.js';
import { useFormat } from '../../lib/format.js';
import { Button, IconButton } from '../../ui/Button.jsx';
import { Badge, Panel } from '../../ui/display.jsx';
import { ErrorState, SkeletonList } from '../../ui/feedback.jsx';
import { Field, Input } from '../../ui/fields.jsx';
import { ConfirmDialog, Modal } from '../../ui/overlays.jsx';
import { useToast } from '../../ui/toast.jsx';

const CLIENT_ICONS = { web: Globe, desktop: Laptop, mobile: Smartphone, integration: Plug };

function RenameDialog({ device, onClose }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();

  const form = useForm({
    initialValues: { name: device.name },
    validate: { name: [rules.required, rules.maxLength(80)] },
    onSubmit: async ({ name }) => {
      await api.devices.update(device.id, { name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      toast.success(t('common:saved'));
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('settings:devices.renameTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button variant="primary" onClick={form.handleSubmit} loading={form.submitting}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <form onSubmit={form.handleSubmit} noValidate>
        <Field
          label={t('settings:devices.name')}
          error={form.errors.name ?? (form.formError && errorMessage(form.formError))}
        >
          {(props) => <Input autoFocus maxLength={80} {...props} {...form.bind('name')} />}
        </Field>
      </form>
    </Modal>
  );
}

export function DevicesSection() {
  const { t } = useTranslation();
  const format = useFormat();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(null);
  const [removing, setRemoving] = useState(null);

  const devices = useQuery({ queryKey: queryKeys.devices, queryFn: () => api.devices.list() });

  const remove = useMutation({
    mutationFn: (deviceId) => api.devices.remove(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      toast.success(t('settings:devices.removed'));
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setRemoving(null),
  });

  return (
    <Panel title={t('settings:devices.title')} description={t('settings:devices.description')}>
      {devices.isPending ? (
        <SkeletonList rows={2} />
      ) : devices.isError ? (
        <ErrorState description={errorMessage(devices.error)} onRetry={devices.refetch} />
      ) : (
        <ul className="flex flex-col">
          {devices.data.map((device) => {
            const Icon = CLIENT_ICONS[device.clientType] ?? Laptop;
            return (
              <li
                key={device.id}
                className="flex items-center gap-3 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-2 text-ink-2">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
                    <span className="truncate">{device.name}</span>
                    {device.current && (
                      <Badge tone="success">{t('settings:devices.thisDevice')}</Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-2">
                    {t(`settings:devices.clientTypes.${device.clientType}`)}
                    {device.appVersion && ` · ${device.appVersion}`}
                    {' · '}
                    {t('settings:devices.lastSeen', { when: format.relative(device.lastSeenAt) })}
                  </p>
                </div>
                <IconButton
                  icon={Pencil}
                  size="sm"
                  label={t('settings:devices.rename', { name: device.name })}
                  onClick={() => setRenaming(device)}
                />
                {!device.current && (
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    variant="danger-ghost"
                    label={t('settings:devices.remove', { name: device.name })}
                    onClick={() => setRemoving(device)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {renaming && <RenameDialog device={renaming} onClose={() => setRenaming(null)} />}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate(removing.id)}
        loading={remove.isPending}
        title={t('settings:devices.removeTitle', { name: removing?.name })}
        description={t('settings:devices.removeDescription')}
        confirmLabel={t('settings:devices.removeConfirm')}
      />
    </Panel>
  );
}
