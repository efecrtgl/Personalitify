import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LinkButton } from '../ui/LinkButton.jsx';
import { EmptyState } from '../ui/feedback.jsx';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={Compass}
      title={t('common:notFound.title')}
      description={t('common:notFound.description')}
      action={
        <LinkButton to="/" variant="primary">
          {t('common:notFound.action')}
        </LinkButton>
      }
    />
  );
}
