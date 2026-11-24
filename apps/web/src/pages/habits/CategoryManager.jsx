import { ITEM_COLORS } from '@personalitify/shared-contracts';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { Button, IconButton } from '../../ui/Button.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../../ui/feedback.jsx';
import { Field, Input } from '../../ui/fields.jsx';
import { ConfirmDialog, Modal } from '../../ui/overlays.jsx';
import { ColorPicker, IconPicker, ItemBadge } from '../../ui/pickers.jsx';
import { useCategories, useCategoryActions } from './useHabits.js';

const blank = { name: '', color: ITEM_COLORS[7], icon: 'star' };

/** Lists the user's categories and lets them add, edit and delete one. */
export function CategoryManager({ onClose }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const categories = useCategories();
  const actions = useCategoryActions();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [removing, setRemoving] = useState(null);
  const saving = actions.create.isPending || actions.update.isPending;

  const save = async (event) => {
    event?.preventDefault();
    if (!draft.name.trim()) {
      setError(t('errors:validation.required'));
      return;
    }
    const values = { name: draft.name.trim(), color: draft.color, icon: draft.icon };
    try {
      if (draft.id) {
        await actions.update.mutateAsync({
          id: draft.id,
          patch: { ...values, baseVersion: draft.version },
        });
      } else {
        await actions.create.mutateAsync(values);
      }
      setDraft(null);
      setError(null);
    } catch (failure) {
      setError(failure?.fieldErrors?.name ?? errorMessage(failure));
    }
  };

  if (draft) {
    return (
      <Modal
        open
        onClose={() => setDraft(null)}
        title={t(draft.id ? 'habits:categories.editTitle' : 'habits:categories.newTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
              {t('common:cancel')}
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {t('common:save')}
            </Button>
          </>
        }
      >
        <form onSubmit={save} noValidate className="flex flex-col gap-4">
          <Field label={t('habits:categories.name')} error={error}>
            {(props) => (
              <Input
                autoFocus
                maxLength={40}
                value={draft.name}
                onChange={(event) => {
                  setDraft({ ...draft, name: event.target.value });
                  setError(null);
                }}
                {...props}
              />
            )}
          </Field>
          <ColorPicker
            label={t('habits:form.color')}
            value={draft.color}
            onChange={(color) => setDraft({ ...draft, color })}
          />
          <IconPicker
            label={t('habits:form.icon')}
            value={draft.icon}
            color={draft.color}
            onChange={(icon) => setDraft({ ...draft, icon })}
          />
        </form>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('habits:categories.title')}
      description={t('habits:categories.description')}
      footer={
        <Button variant="primary" icon={Plus} onClick={() => setDraft(blank)}>
          {t('habits:categories.add')}
        </Button>
      }
    >
      {categories.isPending ? (
        <SkeletonList rows={3} />
      ) : categories.isError ? (
        <ErrorState description={errorMessage(categories.error)} onRetry={categories.refetch} />
      ) : categories.data.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={t('habits:categories.emptyTitle')}
          description={t('habits:categories.emptyDescription')}
          className="py-6"
        />
      ) : (
        <ul className="flex flex-col">
          {categories.data.map((category) => (
            <li
              key={category.id}
              className="flex items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <ItemBadge icon={category.icon} color={category.color} size="sm" />
              <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
                {category.name}
              </span>
              <IconButton
                icon={Pencil}
                size="sm"
                label={t('habits:categories.edit', { name: category.name })}
                onClick={() => setDraft(category)}
              />
              <IconButton
                icon={Trash2}
                size="sm"
                variant="danger-ghost"
                label={t('habits:categories.delete', { name: category.name })}
                onClick={() => setRemoving(category)}
              />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => actions.remove.mutate(removing.id, { onSettled: () => setRemoving(null) })}
        loading={actions.remove.isPending}
        title={t('habits:categories.deleteTitle', { name: removing?.name })}
        description={t('habits:categories.deleteDescription')}
        confirmLabel={t('habits:categories.deleteConfirm')}
      />
    </Modal>
  );
}
