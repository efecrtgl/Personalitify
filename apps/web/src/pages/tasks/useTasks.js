import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { useToast } from '../../ui/toast.jsx';

export function useTaskDay(date) {
  return useQuery({
    queryKey: queryKeys.tasks.day(date),
    queryFn: () => api.tasks.day(date),
    placeholderData: (previous) => previous,
  });
}

/** A filtered list. Returns `{ items, meta }`; `meta.today` comes from the server. */
export function useTaskList(filter, options = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.list(filter),
    queryFn: () => api.tasks.list(filter),
    placeholderData: (previous) => previous,
    ...options,
  });
}

/**
 * Task mutations. Every task view (day, lists, a goal's tasks) is refreshed afterwards, and
 * so are goals, whose progress may depend on their tasks.
 */
export function useTaskActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { t } = useTranslation();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
  };
  const options = (successMessage) => ({
    onSuccess: () => {
      refresh();
      if (successMessage) toast.success(successMessage);
    },
    onError: (error) => {
      // Field errors are shown by the form that submitted them.
      if (error?.code !== 'VALIDATION_FAILED') toast.error(errorMessage(error));
    },
  });

  /** Flips a task between done and open in every cached list before the server answers. */
  const patchCached = (taskId, change) => {
    const apply = (task) => (task.id === taskId ? { ...task, ...change } : task);
    queryClient.setQueriesData({ queryKey: queryKeys.tasks.all }, (data) => {
      if (!data) return data;
      if (Array.isArray(data.items)) return { ...data, items: data.items.map(apply) };
      if (Array.isArray(data.due)) {
        return {
          ...data,
          overdue: data.overdue.map(apply),
          due: data.due.map(apply),
          completed: data.completed.map(apply),
        };
      }
      return data;
    });
  };

  return {
    create: useMutation({
      mutationFn: (input) => api.tasks.create(input),
      ...options(t('tasks:toast.created')),
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => api.tasks.update(id, patch),
      ...options(t('common:saved')),
    }),
    remove: useMutation({
      mutationFn: (id) => api.tasks.remove(id),
      ...options(t('tasks:toast.deleted')),
    }),
    postpone: useMutation({
      mutationFn: ({ id, to }) => api.tasks.postpone(id, to),
      ...options(t('tasks:toast.postponed')),
    }),
    toggle: useMutation({
      mutationFn: (task) =>
        task.status === 'done' ? api.tasks.reopen(task.id) : api.tasks.complete(task.id),
      onMutate: async (task) => {
        await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
        patchCached(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
      },
      onSuccess: (result) => {
        if (result?.next) toast.info(t('tasks:toast.nextCreated'));
      },
      onError: (error) => toast.error(errorMessage(error)),
      onSettled: refresh,
    }),
    subtask: useMutation({
      mutationFn: ({ taskId, subtaskId, title, patch, remove }) => {
        if (remove) return api.tasks.removeSubtask(taskId, subtaskId);
        if (subtaskId) return api.tasks.updateSubtask(taskId, subtaskId, patch);
        return api.tasks.addSubtask(taskId, title);
      },
      ...options(),
    }),
  };
}
