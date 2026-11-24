import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { rules, useForm } from '../../hooks/useForm.js';
import { AuthHeading } from '../../layout/AuthLayout.jsx';
import { useRemoteConfig } from '../../lib/platform.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Banner } from '../../ui/feedback.jsx';
import { Field, Input, PasswordInput } from '../../ui/fields.jsx';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, endedReason } = useAuth();
  const { registrationOpen } = useRemoteConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const errorMessage = useErrorMessage();

  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: { email: [rules.required, rules.email], password: [rules.required] },
    onSubmit: async (values) => {
      await login(values);
      navigate(location.state?.from ?? '/', { replace: true });
    },
  });

  return (
    <>
      <AuthHeading title={t('auth:login.title')} subtitle={t('auth:login.subtitle')} />
      {endedReason && !form.formError && (
        <Banner tone="info" className="mb-5">
          {t('auth:sessionEnded')}
        </Banner>
      )}
      {form.formError && (
        <Banner tone="danger" className="mb-5">
          {errorMessage(form.formError)}
        </Banner>
      )}
      <form onSubmit={form.handleSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t('auth:fields.email')} error={form.errors.email}>
          {(props) => (
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              autoFocus
              {...props}
              {...form.bind('email')}
            />
          )}
        </Field>
        <Field label={t('auth:fields.password')} error={form.errors.password}>
          {(props) => (
            <PasswordInput autoComplete="current-password" {...props} {...form.bind('password')} />
          )}
        </Field>
        <div className="-mt-1 text-right">
          <Link
            to="/forgot-password"
            className="text-caption font-medium text-accent hover:underline"
          >
            {t('auth:login.forgotPassword')}
          </Link>
        </div>
        <Button type="submit" variant="primary" size="lg" loading={form.submitting} fullWidth>
          {t('auth:login.submit')}
        </Button>
      </form>
      {registrationOpen && (
        <p className="mt-6 text-center text-body text-ink-2">
          {t('auth:login.noAccount')}{' '}
          <Link to="/register" className="font-medium text-accent hover:underline">
            {t('auth:login.createAccount')}
          </Link>
        </p>
      )}
    </>
  );
}
