import { useTranslation } from 'react-i18next';
import { useUpdateSettings } from '../../hooks/useAccount.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Panel } from '../../ui/display.jsx';
import { Field, Input, Switch } from '../../ui/fields.jsx';

const CHANNELS = [
  'habitReminders',
  'taskReminders',
  'goalReminders',
  'eventReminders',
  'achievements',
];

export function NotificationsSection() {
  const { t } = useTranslation();
  const { settings } = useAuth();
  const update = useUpdateSettings({ silent: true });
  const { notifications } = settings;
  const set = (patch) => update.mutate({ notifications: patch });

  return (
    <>
      <Panel
        title={t('settings:notifications.title')}
        description={t('settings:notifications.description')}
        bodyClassName="flex flex-col gap-5"
      >
        <Switch
          label={t('settings:notifications.inApp')}
          description={t('settings:notifications.inAppDescription')}
          checked={notifications.inApp}
          onChange={(inApp) => set({ inApp })}
        />
        <div className="h-px bg-line" />
        {CHANNELS.map((channel) => (
          <Switch
            key={channel}
            label={t(`settings:notifications.${channel}`)}
            description={t(`settings:notifications.${channel}Description`)}
            checked={notifications[channel]}
            disabled={!notifications.inApp}
            onChange={(value) => set({ [channel]: value })}
          />
        ))}
      </Panel>

      <Panel
        title={t('settings:notifications.quietHours')}
        description={t('settings:notifications.quietHoursDescription')}
        bodyClassName="flex flex-col gap-5"
      >
        <Switch
          label={t('settings:notifications.quietHoursEnabled')}
          checked={notifications.quietHours.enabled}
          onChange={(enabled) => set({ quietHours: { enabled } })}
        />
        <div className="grid grid-cols-2 gap-4 sm:max-w-xs">
          {['start', 'end'].map((edge) => (
            <Field key={edge} label={t(`settings:notifications.quietHours_${edge}`)}>
              {(props) => (
                <Input
                  type="time"
                  disabled={!notifications.quietHours.enabled}
                  value={notifications.quietHours[edge]}
                  onChange={(event) => {
                    // An emptied time input is not a valid time; keep the stored value.
                    if (event.target.value) set({ quietHours: { [edge]: event.target.value } });
                  }}
                  {...props}
                />
              )}
            </Field>
          ))}
        </div>
      </Panel>
    </>
  );
}
