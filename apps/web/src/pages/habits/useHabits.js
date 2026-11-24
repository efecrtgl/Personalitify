import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { useToast } from '../../ui/toast.jsx';

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: () => api.categories.list() });
}

/** Habits of one day. `date` undefined means today, as decided by the server. */
export function useHabitDay(date) {
  return useQuery({
    queryKey: queryKeys.habits.day(date),
    queryFn: () => api.habits.day(date),
    // Keep the previous day visible while the next one loads, so navigation does not flash.
    placeholderData: (previous) => previous,
  });
}

export function useHabitList(archived) {
  return useQuery({
    queryKey: queryKeys.habits.list(archived),
    queryFn: () => api.habits.list({ archived }),
  });
}

/**
 * Records progress, a skip or a postponement for a habit on a day.
 *
 * The day view is updated at once with a prediction of the result and corrected with the
 * server's answer, which also carries the recalculated streak. On failure the previous state
 * is restored.
 */
export function useSetEntry(date) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const key = queryKeys.habits.day(date);

  const replaceItem = (updated) =>
    queryClient.setQueryData(key, (day) =>
      day
        ? {
            ...day,
            items: day.items.map((item) => (item.habitId === updated.habitId ? updated : item)),
          }
        : day,
    );

  return useMutation({
    // One habit's changes are applied in the order they were made.
    scope: { id: 'habit-entry' },
    mutationFn: ({ item, input }) =>
      input === null
        ? api.habits.clearEntry(item.habitId, item.date)
        : api.habits.setEntry(item.habitId, item.date, input),
    onMutate: async ({ item, input }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      replaceItem(predict(item, input));
      return { previous };
    },
    onSuccess: (updated) => replaceItem(updated),
    onError: (error, variables, context) => {
      queryClient.setQueryData(key, context.previous);
      toast.error(errorMessage(error));
    },
    onSettled: () => {
      // Other days and the habit's own statistics depend on what was recorded.
      queryClient.invalidateQueries({
        queryKey: queryKeys.habits.all,
        predicate: (query) => query.queryKey.join('|') !== key.join('|'),
      });
    },
  });
}

/** What the day item will most likely look like once the server has applied `input`. */
function predict(item, input) {
  if (input === null) {
    return { ...item, value: 0, progress: 0, state: item.due ? 'pending' : 'not_due', entry: null };
  }
  const status = input.status ?? 'active';
  if (status !== 'active') {
    return { ...item, value: 0, progress: 0, state: status };
  }
  const value = Math.max(0, input.value ?? item.value + (input.increment ?? 0));
  const completed = value >= item.target;
  return {
    ...item,
    value,
    progress: Math.min(1, value / item.target),
    state: completed
      ? 'completed'
      : value > 0 && item.due
        ? 'partial'
        : item.due
          ? 'pending'
          : 'not_due',
  };
}

/** A habit mutation that refreshes every habit view and confirms with a toast. */
function useHabitMutation(mutationFn, successMessage) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
      toast.success(successMessage);
    },
    onError: (error) => {
      // Field errors are shown by the form that submitted them.
      if (error?.code !== 'VALIDATION_FAILED') toast.error(errorMessage(error));
    },
  });
}

/** Create, update, archive, restore and delete a habit. */
export function useHabitActions() {
  const { t } = useTranslation();
  return {
    create: useHabitMutation((input) => api.habits.create(input), t('habits:toast.created')),
    update: useHabitMutation(({ id, patch }) => api.habits.update(id, patch), t('common:saved')),
    archive: useHabitMutation((id) => api.habits.archive(id), t('habits:toast.archived')),
    unarchive: useHabitMutation((id) => api.habits.unarchive(id), t('habits:toast.restored')),
    remove: useHabitMutation((id) => api.habits.remove(id), t('habits:toast.deleted')),
  };
}

export function useCategoryActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();

  const options = {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      // Deleting a category detaches the habits that used it.
      queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
    },
    onError: (error) => {
      if (error?.code !== 'VALIDATION_FAILED') toast.error(errorMessage(error));
    },
  };
  return {
    create: useMutation({ mutationFn: (input) => api.categories.create(input), ...options }),
    update: useMutation({
      mutationFn: ({ id, patch }) => api.categories.update(id, patch),
      ...options,
    }),
    remove: useMutation({ mutationFn: (id) => api.categories.remove(id), ...options }),
  };
}
