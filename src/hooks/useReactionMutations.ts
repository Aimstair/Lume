import { useMutation, useQueryClient } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { newId } from '../services/id';
import { triggerSyncNow } from '../services/sync/syncEngine';
import { session } from '../state/session';

type Input = {
  encounterId: string;
  observedProfileId: string;
  messageDate: string;
};

export function useHeartReaction() {
  const queryClient = useQueryClient();

  return useMutation<{ encounterId: string }, Error, Input>({
    mutationFn: async ({ encounterId, observedProfileId, messageDate }: Input) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      localRepo.queue({
        id: newId('out_'),
        opType: 'heart_reaction_by_target',
        tableName: 'message_reactions',
        payloadJson: JSON.stringify({
          encounter_id: encounterId,
          observed_profile_id: observedProfileId,
          message_date: messageDate,
          reactor_profile_id: session.profileId,
          reaction: 'heart',
        }),
        createdAt: new Date().toISOString(),
      });

      await triggerSyncNow();
      return { encounterId };
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profileDashboard', session.profileId] });
    },
  });
}
