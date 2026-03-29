import { useMutation, useQueryClient } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { newId } from '../services/id';
import { triggerSyncNow } from '../services/sync/syncEngine';
import { session } from '../state/session';
import { Profile } from '../types/domain';

type Input = {
  messageId: string;
};

export function useHeartReaction() {
  const queryClient = useQueryClient();

  return useMutation<{ messageId: string }, Error, Input, { previousProfile: Profile }>({
    mutationFn: async ({ messageId }: Input) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      localRepo.queue({
        id: newId('out_'),
        opType: 'heart_reaction',
        tableName: 'message_reactions',
        payloadJson: JSON.stringify({
          message_id: messageId,
          reactor_profile_id: session.profileId,
          reaction: 'heart',
        }),
        createdAt: new Date().toISOString(),
      });

      await triggerSyncNow();
      return { messageId };
    },

    onMutate: async () => {
      if (!session.isReady) {
        return {
          previousProfile: {
            id: 'pending',
            lumeId: 'PENDING',
            displayName: 'You',
            radianceScore: 0,
            createdAt: new Date().toISOString(),
          },
        };
      }

      await queryClient.cancelQueries({ queryKey: ['profileDashboard', session.profileId] });

      const previousProfile =
        queryClient.getQueryData<Profile>(['profileDashboard', session.profileId]) ??
        localRepo.getProfile(session.profileId);

      const optimistic = {
        ...previousProfile,
        radianceScore: previousProfile.radianceScore + 5,
      };

      localRepo.upsertProfile(optimistic);
      queryClient.setQueryData(['profileDashboard', session.profileId], optimistic);

      return { previousProfile };
    },

    onError: (_error: Error, _variables: Input, context) => {
      if (!context?.previousProfile) return;
      localRepo.upsertProfile(context.previousProfile);
      queryClient.setQueryData(['profileDashboard', session.profileId], context.previousProfile);
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profileDashboard', session.profileId] });
    },
  });
}
