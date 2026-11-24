import { useTranslation } from 'react-i18next';
import { useUpdateProfile } from '../../hooks/useAccount.js';
import { rules, useForm } from '../../hooks/useForm.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Avatar, Panel } from '../../ui/display.jsx';
import { Field, Input, Textarea } from '../../ui/fields.jsx';
import { ColorPicker } from '../../ui/pickers.jsx';

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
          <ColorPicker
            label={t('settings:profile.avatarColor')}
            value={form.values.avatarColor}
            onChange={(color) => form.setValue('avatarColor', color)}
          />
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
