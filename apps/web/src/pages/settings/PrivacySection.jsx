import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage, useUpdateSettings } from '../../hooks/useAccount.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Panel } from '../../ui/display.jsx';
import { Switch } from '../../ui/fields.jsx';
import { useToast } from '../../ui/toast.jsx';

/** Hands a JSON document to the browser as a file download. */
function downloadJson(filename, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function PrivacySection() {
  const { t } = useTranslation();
  const { settings } = useAuth();
  const update = useUpdateSettings({ silent: true });
  const toast = useToast();
  const errorMessage = useErrorMessage();

  const exportData = useMutation({
    mutationFn: () => api.account.exportData(),
    onSuccess: (data) => {
      downloadJson(`personalitify-export-${data.exportedAt.slice(0, 10)}.json`, data);
      toast.success(t('settings:privacy.exportReady'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <Panel title={t('settings:privacy.title')} description={t('settings:privacy.description')}>
        <Switch
          label={t('settings:privacy.hidePreviews')}
          description={t('settings:privacy.hidePreviewsDescription')}
          checked={settings.privacy.hideSensitivePreviews}
          onChange={(hideSensitivePreviews) =>
            update.mutate({ privacy: { hideSensitivePreviews } })
          }
        />
      </Panel>
      <Panel
        title={t('settings:privacy.exportTitle')}
        description={t('settings:privacy.exportDescription')}
      >
        <Button icon={Download} onClick={() => exportData.mutate()} loading={exportData.isPending}>
          {t('settings:privacy.exportAction')}
        </Button>
      </Panel>
    </>
  );
}
