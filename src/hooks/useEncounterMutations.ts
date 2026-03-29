import { useMutation, useQueryClient } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { newId } from '../services/id';
import { triggerSyncNow } from '../services/sync/syncEngine';
import { session } from '../state/session';
import { Encounter } from '../types/domain';

type Input = {
  observedProfileId: string;
  observedMessageBody: string;
  observedRadianceScore: number;
  rssi: number | null;
};

export function useAddEncounter() {
  const queryClient = useQueryClient();

  return useMutation<Encounter, Error, Input, { previous: Encounter[] }>({
    mutationFn: async (input: Input) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      const encounter: Encounter = {
        id: newId('enc_'),
        observerProfileId: session.profileId,
        observedProfileId: input.observedProfileId,
        observedMessageBody: input.observedMessageBody,
        observedRadianceScore: input.observedRadianceScore,
        happenedAt: new Date().toISOString(),
        rssi: input.rssi,
        pendingSync: true,
      };

      localRepo.addEncounter(encounter);
      localRepo.queue({
        id: newId('out_'),
        opType: 'insert_encounter',
        tableName: 'encounters',
        payloadJson: JSON.stringify({
          id: encounter.id,
          observer_profile_id: encounter.observerProfileId,
          observed_profile_id: encounter.observedProfileId,
          observed_message_body: encounter.observedMessageBody,
          observed_radiance_score: encounter.observedRadianceScore,
          happened_at: encounter.happenedAt,
          rssi: encounter.rssi,
        }),
        createdAt: new Date().toISOString(),
      });

      await triggerSyncNow();
      return encounter;
    },

    onMutate: async (input: Input) => {
      if (!session.isReady) {
        return { previous: [] };
      }

      await queryClient.cancelQueries({ queryKey: ['echoFeed', session.profileId] });
      const previous = queryClient.getQueryData<Encounter[]>(['echoFeed', session.profileId]) ?? [];
      const optimistic: Encounter = {
        id: newId('enc_'),
        observerProfileId: session.profileId,
        observedProfileId: input.observedProfileId,
        observedMessageBody: input.observedMessageBody,
        observedRadianceScore: input.observedRadianceScore,
        happenedAt: new Date().toISOString(),
        rssi: input.rssi,
        pendingSync: true,
      };
      queryClient.setQueryData(['echoFeed', session.profileId], [optimistic, ...previous]);
      return { previous };
    },

    onError: (_error: Error, _variables: Input, context: { previous: Encounter[] } | undefined) => {
      queryClient.setQueryData(['echoFeed', session.profileId], context?.previous ?? []);
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['echoFeed', session.profileId] });
    },
  });
}
