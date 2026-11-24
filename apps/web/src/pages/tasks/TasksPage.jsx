import { CircleCheckBig, ListTodo, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { addDays, weekdayOf } from '../../lib/dates.js';
import { useFormat } from '../../lib/format.js';
import { Button } from '../../ui/Button.jsx';
import { Card, PageHeader } from '../../ui/display.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../../ui/feedback.jsx';
import { Input } from '../../ui/fields.jsx';
import { LinkTabs } from '../../ui/LinkButton.jsx';
import { useCategories } from '../habits/useHabits.js';
import { TaskFormModal } from './TaskFormModal.jsx';
import { TaskRow, dueLabel } from './TaskRow.jsx';
import { useTaskActions, useTaskDay, useTaskList } from './useTasks.js';

const taskTabs = (t) => [
  { to: '/tasks', label: t('tasks:tabs.today'), end: true },
  { to: '/tasks/upcoming', label: t('tasks:tabs.upcoming') },
  { to: '/tasks/all', label: t('tasks:tabs.all') },
  { to: '/tasks/done', label: t('tasks:tabs.done') },
];

/** A titled group of task rows. Renders nothing when it has no tasks. */
function TaskSection({ title, tone, tasks, ...rowProps }) {
  if (tasks.length === 0) return null;
  return (
    <section className="mb-6">
      {title && (
        <h2
          className={`mb-2 px-1 text-caption font-semibold tracking-wide uppercase ${
            tone === 'danger' ? 'text-danger' : 'text-ink-2'
          }`}
        >
          {title}
        </h2>
      )}
      <Card>
        <ul>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} {...rowProps} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** Adds a task with one line of text; everything else can be filled in later. */
function QuickAdd({ dueDate, goalId, actions }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const submit = (event) => {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    actions.create.mutate(
      { title: value, dueDate: dueDate ?? null, goalId: goalId ?? null },
      { onSuccess: () => setTitle('') },
    );
  };
  return (
    <form onSubmit={submit} className="mb-6 flex gap-2">
      <Input
        aria-label={t('tasks:quickAdd.label')}
        placeholder={t('tasks:quickAdd.placeholder')}
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button
        type="submit"
        variant="primary"
        icon={Plus}
        loading={actions.create.isPending}
        disabled={!title.trim()}
      >
        {t('tasks:quickAdd.submit')}
      </Button>
    </form>
  );
}

function useRowProps(setEditing) {
  const actions = useTaskActions();
  const categories = useCategories();
  const byId = new Map((categories.data ?? []).map((category) => [category.id, category]));
  return {
    actions,
    rowProps: (today) => ({ today, actions, onEdit: setEditing, categories: byId }),
  };
}

function TodayView({ setEditing }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const day = useTaskDay();
  const { actions, rowProps } = useRowProps(setEditing);

  if (day.isPending) return <SkeletonList rows={4} />;
  if (day.isError)
    return <ErrorState description={errorMessage(day.error)} onRetry={day.refetch} />;
  const { today, overdue, due, completed } = day.data;
  const props = rowProps(today);
  const empty = overdue.length + due.length + completed.length === 0;

  return (
    <>
      <QuickAdd dueDate={today} actions={actions} />
      {empty ? (
        <Card>
          <EmptyState
            icon={CircleCheckBig}
            title={t('tasks:empty.todayTitle')}
            description={t('tasks:empty.todayDescription')}
          />
        </Card>
      ) : (
        <>
          <TaskSection
            title={t('tasks:sections.overdue')}
            tone="danger"
            tasks={overdue}
            {...props}
          />
          <TaskSection title={t('tasks:sections.today')} tasks={due} {...props} showDate={false} />
          <TaskSection title={t('tasks:sections.completed')} tasks={completed} {...props} />
        </>
      )}
    </>
  );
}

function UpcomingView({ setEditing }) {
  const { t } = useTranslation();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  // "Today" is only known from the server, so ask for it first.
  const day = useTaskDay();
  const today = day.data?.today;
  const list = useTaskList(
    {
      status: 'open',
      dueFrom: today && addDays(today, 1),
      dueTo: today && addDays(today, 14),
      limit: 100,
    },
    { enabled: Boolean(today) },
  );
  const { rowProps } = useRowProps(setEditing);

  if (day.isPending || list.isPending) return <SkeletonList rows={4} />;
  const failed = day.error ?? list.error;
  if (failed) return <ErrorState description={errorMessage(failed)} onRetry={list.refetch} />;
  if (list.data.items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ListTodo}
          title={t('tasks:empty.upcomingTitle')}
          description={t('tasks:empty.upcomingDescription')}
        />
      </Card>
    );
  }

  const byDate = new Map();
  for (const task of list.data.items) {
    byDate.set(task.dueDate, [...(byDate.get(task.dueDate) ?? []), task]);
  }
  return [...byDate].map(([date, tasks]) => (
    <TaskSection
      key={date}
      title={`${dueLabel(t, format, date, today)} · ${format.weekdayName(weekdayOf(date))}`}
      tasks={tasks}
      {...rowProps(today)}
      showDate={false}
    />
  ));
}

function AllView({ setEditing, done = false }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const filter = done
    ? { status: 'done', sort: 'completed', limit, search: search.trim() || undefined }
    : { status: 'open', sort: 'due', limit, search: search.trim() || undefined };
  const list = useTaskList(filter);
  const { rowProps } = useRowProps(setEditing);

  const searchBox = (
    <div className="relative mb-6">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
        aria-hidden="true"
      />
      <Input
        type="search"
        aria-label={t('tasks:search.label')}
        placeholder={t('tasks:search.placeholder')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="pl-9"
      />
    </div>
  );

  if (list.isPending) {
    return (
      <>
        {searchBox}
        <SkeletonList rows={4} />
      </>
    );
  }
  if (list.isError) {
    return (
      <>
        {searchBox}
        <ErrorState description={errorMessage(list.error)} onRetry={list.refetch} />
      </>
    );
  }

  const { items, meta } = list.data;
  const props = rowProps(meta.today);
  const dated = items.filter((task) => task.dueDate);
  const undated = items.filter((task) => !task.dueDate);

  return (
    <>
      {searchBox}
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={done ? CircleCheckBig : ListTodo}
            title={t(
              search.trim()
                ? 'tasks:empty.searchTitle'
                : done
                  ? 'tasks:empty.doneTitle'
                  : 'tasks:empty.allTitle',
            )}
            description={t(
              search.trim()
                ? 'tasks:empty.searchDescription'
                : done
                  ? 'tasks:empty.doneDescription'
                  : 'tasks:empty.allDescription',
            )}
          />
        </Card>
      ) : done ? (
        <TaskSection tasks={items} {...props} />
      ) : (
        <>
          <TaskSection title={t('tasks:sections.dated')} tasks={dated} {...props} />
          <TaskSection title={t('tasks:sections.undated')} tasks={undated} {...props} />
        </>
      )}
      {meta.total > items.length && (
        <div className="flex justify-center">
          <Button onClick={() => setLimit(Math.min(100, limit + 50))} disabled={limit >= 100}>
            {t('tasks:loadMore', { shown: items.length, total: meta.total })}
          </Button>
        </div>
      )}
    </>
  );
}

const VIEWS = { today: TodayView, upcoming: UpcomingView, all: AllView, done: AllView };

export function TasksPage({ view = 'today' }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(null);
  const View = VIEWS[view];

  return (
    <>
      <PageHeader
        title={t('tasks:title')}
        description={t('tasks:description')}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            {t('tasks:actions.new')}
          </Button>
        }
      />
      <LinkTabs label={t('tasks:tabs.label')} tabs={taskTabs(t)} />
      <View setEditing={setEditing} done={view === 'done'} />
      {editing && (
        <TaskFormModal task={editing.id ? editing : null} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

export { QuickAdd, TaskSection };
