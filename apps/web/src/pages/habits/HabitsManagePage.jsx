import {
  Archive,
  ArchiveRestore,
  EllipsisVertical,
  Pencil,
  Plus,
  Sprout,
  Tags,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { useFormat } from '../../lib/format.js';
import { Button, IconButton } from '../../ui/Button.jsx';
import { Badge, Card, PageHeader } from '../../ui/display.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../../ui/feedback.jsx';
import { SegmentedControl } from '../../ui/fields.jsx';
import { LinkTabs } from '../../ui/LinkButton.jsx';
import { ConfirmDialog, Menu } from '../../ui/overlays.jsx';
import { ItemBadge } from '../../ui/pickers.jsx';
import { CategoryManager } from './CategoryManager.jsx';
import { HabitFormModal } from './HabitFormModal.jsx';
import { habitTabs } from './HabitsPage.jsx';
import { describeSchedule, describeTarget } from './habitText.js';
import { useCategories, useHabitActions, useHabitList } from './useHabits.js';

/** Every habit, active or archived, with the actions that manage them. */
export function HabitsManagePage() {
  const { t } = useTranslation();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const [archived, setArchived] = useState('false');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [showCategories, setShowCategories] = useState(false);

  const habits = useHabitList(archived);
  const categories = useCategories();
  const actions = useHabitActions();
  const categoryById = new Map((categories.data ?? []).map((category) => [category.id, category]));

  return (
    <>
      <PageHeader
        title={t('habits:title')}
        description={t('habits:description')}
        actions={
          <>
            <Button icon={Tags} onClick={() => setShowCategories(true)}>
              {t('habits:categories.title')}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
              {t('habits:actions.new')}
            </Button>
          </>
        }
      />
      <LinkTabs label={t('habits:tabs.label')} tabs={habitTabs(t)} />

      <SegmentedControl
        label={t('habits:manage.filter')}
        value={archived}
        onChange={setArchived}
        options={[
          { value: 'false', label: t('habits:manage.active') },
          { value: 'true', label: t('habits:manage.archived') },
        ]}
        className="mb-4"
      />

      {habits.isPending ? (
        <SkeletonList rows={4} />
      ) : habits.isError ? (
        <ErrorState description={errorMessage(habits.error)} onRetry={habits.refetch} />
      ) : habits.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={archived === 'true' ? Archive : Sprout}
            title={t(archived === 'true' ? 'habits:empty.archivedTitle' : 'habits:empty.listTitle')}
            description={t(
              archived === 'true'
                ? 'habits:empty.archivedDescription'
                : 'habits:empty.listDescription',
            )}
            action={
              archived === 'false' && (
                <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
                  {t('habits:actions.new')}
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {habits.data.map((habit) => {
            const category = categoryById.get(habit.categoryId);
            const target = describeTarget(t, format, habit.target);
            return (
              <Card
                as="li"
                key={habit.id}
                className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4"
              >
                <ItemBadge icon={habit.icon} color={habit.color} />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/habits/${habit.id}`}
                    className="block truncate text-body font-semibold text-ink hover:underline"
                  >
                    {habit.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-2">
                    <span>{describeSchedule(t, format, habit.schedule)}</span>
                    {target && <span>{target}</span>}
                    {category && <Badge>{category.name}</Badge>}
                  </p>
                </div>
                <Menu
                  label={t('habits:actions.more', { name: habit.name })}
                  trigger={
                    <IconButton
                      icon={EllipsisVertical}
                      size="sm"
                      label={t('habits:actions.more', { name: habit.name })}
                    />
                  }
                  items={[
                    {
                      id: 'edit',
                      label: t('habits:actions.edit'),
                      icon: Pencil,
                      onSelect: () => setEditing(habit),
                    },
                    habit.archived
                      ? {
                          id: 'unarchive',
                          label: t('habits:actions.unarchive'),
                          icon: ArchiveRestore,
                          onSelect: () => actions.unarchive.mutate(habit.id),
                        }
                      : {
                          id: 'archive',
                          label: t('habits:actions.archive'),
                          icon: Archive,
                          onSelect: () => actions.archive.mutate(habit.id),
                        },
                    { separator: true },
                    {
                      id: 'delete',
                      label: t('habits:actions.delete'),
                      icon: Trash2,
                      tone: 'danger',
                      onSelect: () => setRemoving(habit),
                    },
                  ]}
                />
              </Card>
            );
          })}
        </ul>
      )}

      {editing && (
        <HabitFormModal habit={editing.id ? editing : null} onClose={() => setEditing(null)} />
      )}
      {showCategories && <CategoryManager onClose={() => setShowCategories(false)} />}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => actions.remove.mutate(removing.id, { onSettled: () => setRemoving(null) })}
        loading={actions.remove.isPending}
        title={t('habits:delete.title', { name: removing?.name })}
        description={t('habits:delete.description')}
        confirmLabel={t('habits:actions.delete')}
      />
    </>
  );
}
