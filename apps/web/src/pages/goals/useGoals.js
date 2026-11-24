import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { useToast } from '../../ui/toast.jsx';

export function useGoalList(filter) {
  return useQuery({
    queryKey: queryKeys.goals.list(filter),
    queryFn: () => api.goals.list(filter),
    placeholderData: (previous) => previous,
  });
}

export function useGoalDetail(goalId) {
  return useQuery({
    queryKey: queryKeys.goals.detail(goalId),
    queryFn: () => api.goals.get(goalId),
  });
}

/** Goal mutations; every goal view is refreshed afterwards. */
export function useGoalActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { t } = useTranslation();

  const options = (successMessage) => ({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
      if (successMessage) toast.success(successMessage);
    },
    onError: (error) => {
      if (error?.code !== 'VALIDATION_FAILED') toast.error(errorMessage(error));
    },
  });

  return {
    create: useMutation({
      mutationFn: (input) => api.goals.create(input),
      ...options(t('goals:toast.created')),
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => api.goals.update(id, patch),
      ...options(),
    }),
    remove: useMutation({
      mutationFn: (id) => api.goals.remove(id),
      ...options(t('goals:toast.deleted')),
    }),
    milestone: useMutation({
      mutationFn: ({ goalId, milestoneId, input, patch, remove }) => {
        if (remove) return api.goals.removeMilestone(goalId, milestoneId);
        if (milestoneId) return api.goals.updateMilestone(goalId, milestoneId, patch);
        return api.goals.addMilestone(goalId, input);
      },
      ...options(),
    }),
    review: useMutation({
      mutationFn: ({ goalId, reviewId, input }) =>
        reviewId ? api.goals.removeReview(goalId, reviewId) : api.goals.addReview(goalId, input),
      ...options(),
    }),
  };
}
