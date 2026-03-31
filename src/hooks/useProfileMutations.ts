import { useMutation, useQueryClient } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { newId } from '../services/id';
import { triggerSyncNow } from '../services/sync/syncEngine';
import { session } from '../state/session';
import { Profile } from '../types/domain';

const DISPLAY_NAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export type DisplayNameCooldownStatus = {
  canChange: boolean;
  nextChangeAt: string | null;
  remainingMs: number;
};

export function getDisplayNameCooldownStatus(lastChangedAt: string | null): DisplayNameCooldownStatus {
  if (!lastChangedAt) {
    return {
      canChange: true,
      nextChangeAt: null,
      remainingMs: 0,
    };
  }

  const changedAt = new Date(lastChangedAt);
  const changedAtMs = changedAt.getTime();

  if (Number.isNaN(changedAtMs)) {
    return {
      canChange: true,
      nextChangeAt: null,
      remainingMs: 0,
    };
  }

  const nextChangeAtMs = changedAtMs + DISPLAY_NAME_COOLDOWN_MS;
  const remainingMs = Math.max(0, nextChangeAtMs - Date.now());

  return {
    canChange: remainingMs === 0,
    nextChangeAt: new Date(nextChangeAtMs).toISOString(),
    remainingMs,
  };
}

type UpdateDisplayNameInput = {
  displayName: string;
};

type UpdateDisplayNameResult = {
  displayName: string;
  changedAt: string;
};

export function useUpdateDisplayName() {
  const queryClient = useQueryClient();

  return useMutation<UpdateDisplayNameResult, Error, UpdateDisplayNameInput, { previousProfile: Profile | null }>({
    mutationFn: async ({ displayName }: UpdateDisplayNameInput) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      const nextDisplayName = displayName.trim();
      if (!nextDisplayName) {
        throw new Error('Display name cannot be empty');
      }

      const currentProfile = localRepo.getProfile(session.profileId);
      const cooldown = getDisplayNameCooldownStatus(currentProfile.displayNameChangedAt);
      if (!cooldown.canChange) {
        const nextDateLabel = cooldown.nextChangeAt
          ? new Date(cooldown.nextChangeAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'later';
        throw new Error(`Display name can be changed again on ${nextDateLabel}.`);
      }

      const changedAt = new Date().toISOString();
      localRepo.updateProfileDisplayName(session.profileId, nextDisplayName, changedAt);

      localRepo.queue({
        id: newId('out_'),
        opType: 'update_profile_display_name',
        tableName: 'profiles',
        payloadJson: JSON.stringify({
          id: session.profileId,
          display_name: nextDisplayName,
        }),
        createdAt: changedAt,
      });

      await triggerSyncNow();

      return {
        displayName: nextDisplayName,
        changedAt,
      };
    },

    onMutate: async ({ displayName }: UpdateDisplayNameInput) => {
      if (!session.isReady) {
        return { previousProfile: null };
      }

      await queryClient.cancelQueries({ queryKey: ['profileDashboard', session.profileId] });
      const previousProfile =
        queryClient.getQueryData<Profile>(['profileDashboard', session.profileId]) ?? null;

      if (previousProfile) {
        queryClient.setQueryData<Profile>(['profileDashboard', session.profileId], {
          ...previousProfile,
          displayName: displayName.trim(),
          displayNameChangedAt: new Date().toISOString(),
        });
      }

      return {
        previousProfile,
      };
    },

    onError: (_error: Error, _variables: UpdateDisplayNameInput, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(['profileDashboard', session.profileId], context.previousProfile);
      }
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profileDashboard', session.profileId] });
    },
  });
}
