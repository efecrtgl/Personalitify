import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { rules, useForm } from '../../hooks/useForm.js';
import { AuthHeading } from '../../layout/AuthLayout.jsx';
import { useRemoteConfig } from '../../lib/platform.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Banner } from '../../ui/feedback.jsx';
import { Field, Input, PasswordInput } from '../../ui/fields.jsx';
import { LinkButton } from '../../ui/LinkButton.jsx';

export function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { registrationOpen } = useRemoteConfig();

  const form = useForm({
    initialValues: { displayName: '', email: '', password: '' },
    validate: {
      displayName: [rules.required, rules.maxLength(60)],
      email: [rules.required, rules.email],
      password: [rules.required, rules.minLength(8), rules.maxLength(128)],
    },
    onSubmit: async (values) => {
      await register({ ...values, displayName: values.displayName.trim() });
      navigate('/', { replace: true });
    },
  });

  // The server refuses registrations while they are closed; the form is not offered then.
  if (!registrationOpen) {
    return (
      <>
        <AuthHeading
          title={t('platform:registrationClosed.title')}
          subtitle={t('platform:registrationClosed.description')}
        />
        <LinkButton to="/login" variant="primary" size="lg" fullWidth>
          {t('platform:registrationClosed.signIn')}
        </LinkButton>
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t('auth:register.title')} subtitle={t('auth:register.subtitle')} />
      {form.formError && (
        <Banner tone="danger" className="mb-5">
          {errorMessage(form.formError)}
        </Banner>
      )}
      <form onSubmit={form.handleSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t('auth:fields.displayName')} error={form.errors.displayName}>
          {(props) => (
            <Input
              autoComplete="name"
              autoFocus
              maxLength={60}
              {...props}
              {...form.bind('displayName')}
            />
          )}
        </Field>
        <Field label={t('auth:fields.email')} error={form.errors.email}>
          {(props) => (
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              {...props}
              {...form.bind('email')}
            />
          )}
        </Field>
        <Field
          label={t('auth:fields.password')}
          hint={t('auth:register.passwordHint')}
          error={form.errors.password}
        >
          {(props) => (
            <PasswordInput autoComplete="new-password" {...props} {...form.bind('password')} />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={form.submitting} fullWidth>
          {t('auth:register.submit')}
        </Button>
      </form>
      <p className="mt-6 text-center text-body text-ink-2">
        {t('auth:register.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          {t('auth:register.signIn')}
        </Link>
      </p>
    </>
  );
}
