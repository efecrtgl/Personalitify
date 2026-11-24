import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { rules, useForm } from '../../hooks/useForm.js';
import { AuthHeading } from '../../layout/AuthLayout.jsx';
import { api } from '../../lib/api.js';
import { Button } from '../../ui/Button.jsx';
import { Banner, EmptyState } from '../../ui/feedback.jsx';
import { Field, Input, PasswordInput } from '../../ui/fields.jsx';
import { useToast } from '../../ui/toast.jsx';

function BackToLogin() {
  const { t } = useTranslation();
  return (
    <p className="mt-6 text-center text-body">
      <Link to="/login" className="font-medium text-accent hover:underline">
        {t('auth:backToLogin')}
      </Link>
    </p>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [sentTo, setSentTo] = useState(null);

  const form = useForm({
    initialValues: { email: '' },
    validate: { email: [rules.required, rules.email] },
    onSubmit: async ({ email }) => {
      await api.auth.forgotPassword(email.trim());
      setSentTo(email.trim());
    },
  });

  if (sentTo) {
    return (
      <>
        <EmptyState
          icon={MailCheck}
          title={t('auth:forgot.sentTitle')}
          description={t('auth:forgot.sentDescription', { email: sentTo })}
          className="px-0 py-4"
        />
        <BackToLogin />
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t('auth:forgot.title')} subtitle={t('auth:forgot.subtitle')} />
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
        <Button type="submit" variant="primary" size="lg" loading={form.submitting} fullWidth>
          {t('auth:forgot.submit')}
        </Button>
      </form>
      <BackToLogin />
    </>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const token = searchParams.get('token');

  const form = useForm({
    initialValues: { password: '' },
    validate: { password: [rules.required, rules.minLength(8), rules.maxLength(128)] },
    onSubmit: async ({ password }) => {
      await api.auth.resetPassword({ token, password });
      toast.success(t('auth:reset.success'));
      navigate('/login', { replace: true });
    },
  });

  if (!token) {
    return (
      <>
        <Banner tone="danger" title={t('auth:reset.invalidTitle')}>
          {t('auth:reset.invalidDescription')}
        </Banner>
        <p className="mt-6 text-center text-body">
          <Link to="/forgot-password" className="font-medium text-accent hover:underline">
            {t('auth:reset.requestNew')}
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t('auth:reset.title')} subtitle={t('auth:reset.subtitle')} />
      {form.formError && (
        <Banner
          tone="danger"
          className="mb-5"
          action={
            form.formError.code === 'INVALID_TOKEN' && (
              <Link to="/forgot-password" className="text-caption font-medium text-accent">
                {t('auth:reset.requestNew')}
              </Link>
            )
          }
        >
          {errorMessage(form.formError)}
        </Banner>
      )}
      <form onSubmit={form.handleSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label={t('auth:reset.newPassword')}
          hint={t('auth:register.passwordHint')}
          error={form.errors.password}
        >
          {(props) => (
            <PasswordInput
              autoComplete="new-password"
              autoFocus
              {...props}
              {...form.bind('password')}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={form.submitting} fullWidth>
          {t('auth:reset.submit')}
        </Button>
      </form>
      <BackToLogin />
    </>
  );
}
