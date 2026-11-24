import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../hooks/useAccount.js';
import { api } from '../lib/api.js';
import { useAuth } from '../providers/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { Banner } from '../ui/feedback.jsx';
import { useToast } from '../ui/toast.jsx';

const DISMISSED_KEY = 'pfy.verificationBannerDismissed';

/** Whether the reminder was dismissed in this browser session. */
function wasDismissed() {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Reminds the user to confirm their email address and lets them request a new link.
 * Dismissing it hides it until the next browser session; the status stays visible under
 * Settings → Security.
 */
export function EmailVerificationBanner() {
  const { t } = useTranslation();
  const { user, refetchMe } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [dismissed, setDismissed] = useState(wasDismissed);

  const resend = useMutation({
    mutationFn: () => api.auth.resendVerification(),
    onSuccess: () => toast.success(t('auth:verification.resent', { email: user.email })),
    onError: (error) => {
      // Verified in another tab or on another device in the meantime.
      if (error.code === 'EMAIL_ALREADY_VERIFIED') refetchMe();
      else toast.error(errorMessage(error));
    },
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Without session storage the reminder simply returns on the next page load.
    }
  };

  return (
    <Banner
      tone="warning"
      title={t('auth:verification.bannerTitle')}
      className="mb-6"
      onDismiss={dismiss}
      action={
        <Button size="sm" onClick={() => resend.mutate()} loading={resend.isPending}>
          {t('auth:verification.resend')}
        </Button>
      }
    >
      {t('auth:verification.bannerDescription', { email: user.email })}
    </Banner>
  );
}
