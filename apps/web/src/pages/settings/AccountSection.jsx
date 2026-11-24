import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { rules, useForm } from '../../hooks/useForm.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Panel } from '../../ui/display.jsx';
import { Field, PasswordInput } from '../../ui/fields.jsx';
import { Modal } from '../../ui/overlays.jsx';
import { useToast } from '../../ui/toast.jsx';

function DeleteAccountDialog({ onClose }) {
  const { t } = useTranslation();
  const { leave } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();

  const form = useForm({
    initialValues: { password: '' },
    validate: { password: [rules.required] },
    onSubmit: async ({ password }) => {
      await api.account.delete(password);
      toast.info(t('settings:account.deleted'));
      leave();
    },
  });

  const error =
    form.errors.password ??
    (form.formError &&
      (form.formError.code === 'INVALID_CREDENTIALS'
        ? t('settings:security.wrongPassword')
        : errorMessage(form.formError)));

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('settings:account.deleteTitle')}
      description={t('settings:account.deleteWarning')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={form.submitting}>
            {t('common:cancel')}
          </Button>
          <Button variant="danger" onClick={form.handleSubmit} loading={form.submitting}>
            {t('settings:account.deleteConfirm')}
          </Button>
        </>
      }
    >
      <form onSubmit={form.handleSubmit} noValidate>
        <Field label={t('settings:account.confirmWithPassword')} error={error}>
          {(props) => (
            <PasswordInput
              autoComplete="current-password"
              autoFocus
              {...props}
              {...form.bind('password')}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

export function AccountSection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Panel title={t('settings:account.title')} description={t('settings:account.description')}>
      <Button
        variant="danger-ghost"
        onClick={() => setOpen(true)}
        className="ring-1 ring-danger/30"
      >
        {t('settings:account.deleteAction')}
      </Button>
      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </Panel>
  );
}
