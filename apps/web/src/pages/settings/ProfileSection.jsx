import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUpdateProfile } from '../../hooks/useAccount.js';
import { rules, useForm } from '../../hooks/useForm.js';
import { cn } from '../../lib/cn.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Avatar, Panel } from '../../ui/display.jsx';
import { Field, Input, Textarea } from '../../ui/fields.jsx';

/** Avatar colors; names are localized for assistive technology. */
export const AVATAR_COLORS = [
  { value: '#0a84ff', key: 'blue' },
  { value: '#5e5ce6', key: 'indigo' },
  { value: '#bf5af2', key: 'purple' },
  { value: '#ff375f', key: 'pink' },
  { value: '#ff453a', key: 'red' },
  { value: '#ff9f0a', key: 'orange' },
  { value: '#ffd60a', key: 'yellow' },
  { value: '#30d158', key: 'green' },
  { value: '#40c8e0', key: 'teal' },
  { value: '#8e8e93', key: 'gray' },
];

export function ProfileSection() {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const updateProfile = useUpdateProfile();

  const form = useForm({
    initialValues: {
      displayName: profile.displayName,
      bio: profile.bio,
      avatarColor: profile.avatarColor,
    },
    validate: {
      displayName: [rules.required, rules.maxLength(60)],
      bio: [rules.maxLength(280)],
    },
    onSubmit: (values) =>
      updateProfile.mutateAsync({
        displayName: values.displayName.trim(),
        bio: values.bio.trim(),
        avatarColor: values.avatarColor,
      }),
  });

  const changed =
    form.values.displayName.trim() !== profile.displayName ||
    form.values.bio.trim() !== profile.bio ||
    form.values.avatarColor !== profile.avatarColor;

  return (
    <Panel title={t('settings:profile.title')} description={t('settings:profile.description')}>
      <form onSubmit={form.handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Avatar
            name={form.values.displayName || user.email}
            color={form.values.avatarColor}
            size="lg"
          />
          <fieldset className="min-w-0">
            <legend className="mb-2 text-caption font-medium text-ink">
              {t('settings:profile.avatarColor')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((color) => {
                const selected = form.values.avatarColor.toLowerCase() === color.value;
                return (
                  <label
                    key={color.value}
                    title={t(`settings:profile.colors.${color.key}`)}
                    style={{ backgroundColor: color.value }}
                    className={cn(
                      'flex size-7 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow',
                      'has-focus-visible:ring-2 has-focus-visible:ring-accent',
                      selected && 'ring-2 ring-ink-3',
                    )}
                  >
                    <input
                      type="radio"
                      name="avatarColor"
                      value={color.value}
                      checked={selected}
                      onChange={() => form.setValue('avatarColor', color.value)}
                      className="sr-only"
                      aria-label={t(`settings:profile.colors.${color.key}`)}
                    />
                    {selected && <Check className="size-4 text-white" aria-hidden="true" />}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <Field label={t('settings:profile.displayName')} error={form.errors.displayName}>
          {(props) => (
            <Input autoComplete="name" maxLength={60} {...props} {...form.bind('displayName')} />
          )}
        </Field>
        <Field
          label={t('settings:profile.bio')}
          hint={t('settings:profile.bioHint', { count: 280 - form.values.bio.length })}
          error={form.errors.bio}
          optional
        >
          {(props) => <Textarea maxLength={280} {...props} {...form.bind('bio')} />}
        </Field>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={form.submitting} disabled={!changed}>
            {t('common:save')}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
