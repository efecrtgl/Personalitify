import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, queryKeys } from '../lib/api.js';
import { useToast } from '../ui/toast.jsx';

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Mirrors the server's merge rule for partial updates: nested objects merge, the rest replaces. */
function mergePatch(target, patch) {
  const result = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    result[key] =
      isPlainObject(value) && isPlainObject(target?.[key]) ? mergePatch(target[key], value) : value;
  }
  return result;
}

/** Human-readable message for a failed request. The server already localized it. */
export function useErrorMessage() {
  const { t } = useTranslation();
  return (error) => {
    if (error?.isNetworkError) return t('common:errors.network');
    return error?.message && error.code !== error.message
      ? error.message
      : t('common:errors.generic');
  };
}

/**
 * Updates one of the user's synchronized singletons (`profile` or `settings`).
 *
 * The change is shown immediately and rolled back if the server rejects it. Requests for the
 * same resource run one after another, so each carries the version produced by the previous
 * one; a conflict with another device reloads the server's state.
 */
function useUpdateMe(resource, request, { silent = false } = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { t } = useTranslation();

  return useMutation({
    scope: { id: `me-${resource}` },
    mutationFn: (patch) => {
      const baseVersion = queryClient.getQueryData(queryKeys.me)?.[resource]?.version;
      return request({ ...patch, baseVersion });
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me });
      const previous = queryClient.getQueryData(queryKeys.me);
      if (previous) {
        queryClient.setQueryData(queryKeys.me, {
          ...previous,
          // Keep the confirmed version: only the server assigns versions.
          [resource]: mergePatch(previous[resource], patch),
        });
      }
      return { previous };
    },
    onSuccess: (updated) => {
      const current = queryClient.getQueryData(queryKeys.me);
      if (current) queryClient.setQueryData(queryKeys.me, { ...current, [resource]: updated });
      if (!silent) toast.success(t('common:saved'));
    },
    onError: (error, patch, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.me, context.previous);
      if (error?.code === 'VERSION_CONFLICT') {
        queryClient.invalidateQueries({ queryKey: queryKeys.me });
        toast.error(t('common:errors.conflict'));
      } else if (error?.code !== 'VALIDATION_FAILED') {
        toast.error(errorMessage(error));
      }
    },
  });
}

export const useUpdateSettings = (options) =>
  useUpdateMe('settings', (patch) => api.settings.update(patch), options);

export const useUpdateProfile = (options) =>
  useUpdateMe('profile', (patch) => api.users.updateProfile(patch), options);
