import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { LinkButton } from '../../ui/LinkButton.jsx';
import { Banner, EmptyState, Spinner } from '../../ui/feedback.jsx';

/** Landing page of the link in the verification email. */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [state, setState] = useState(token ? { phase: 'verifying' } : { phase: 'missing' });
  const started = useRef(false);

  useEffect(() => {
    // The token is single-use, so the request must be sent exactly once even when React
    // runs effects twice in development.
    if (!token || started.current) return;
    started.current = true;
    api.auth
      .verifyEmail(token)
      .then(() => {
        setState({ phase: 'done' });
        queryClient.invalidateQueries({ queryKey: queryKeys.me });
      })
      .catch((error) => setState({ phase: 'failed', error }));
  }, [token, queryClient]);

  const destination = status === 'authenticated' ? '/' : '/login';
  const continueLabel = t(status === 'authenticated' ? 'auth:verify.continue' : 'auth:backToLogin');

  if (state.phase === 'verifying') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Spinner className="size-7" />
        <p className="text-body text-ink-2">{t('auth:verify.verifying')}</p>
      </div>
    );
  }

  if (state.phase === 'done') {
    return (
      <EmptyState
        icon={CircleCheck}
        title={t('auth:verify.successTitle')}
        description={t('auth:verify.successDescription')}
        className="px-0 py-4"
        action={
          <LinkButton to={destination} variant="primary">
            {continueLabel}
          </LinkButton>
        }
      />
    );
  }

  return (
    <>
      <Banner tone="danger" title={t('auth:verify.errorTitle')}>
        {state.phase === 'failed' && state.error.code !== 'INVALID_TOKEN'
          ? errorMessage(state.error)
          : t('auth:verify.errorDescription')}
      </Banner>
      <p className="mt-6 text-center text-body">
        <Link to={destination} className="font-medium text-accent hover:underline">
          {continueLabel}
        </Link>
      </p>
    </>
  );
}
