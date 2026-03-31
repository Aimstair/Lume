import { useMutation, useQueryClient } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { newId, newUuid } from '../services/id';
import { triggerSyncNow } from '../services/sync/syncEngine';
import { session } from '../state/session';
import { Encounter } from '../types/domain';

type Input = {
  observedProfileId: string;
  observedMessageBody: string;
  observedMessageDate?: string;
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

      const observedMessageDate = input.observedMessageDate ?? new Date().toISOString().slice(0, 10);

      const encounter: Encounter = {
        id: newUuid(),
        observerProfileId: session.profileId,
        observedProfileId: input.observedProfileId,
        observedMessageBody: input.observedMessageBody,
        observedMessageDate,
        observedPinType: 'classic',
        observedRippleCount: 0,
        originalSenderId: null,
        observedAuraColor: null,
        observedVoiceSpark: null,
        observedRadianceScore: input.observedRadianceScore,
        happenedAt: new Date().toISOString(),
        encounterLatitude: null,
        encounterLongitude: null,
        rssi: input.rssi,
        pendingSync: true,
        seen: false,
        pinned: false,
        reportHits: 0,
        reported: false,
        deleted: false,
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
          observed_message_date: encounter.observedMessageDate,
          observed_pin_type: encounter.observedPinType,
          observed_ripple_count: encounter.observedRippleCount,
          original_sender_id: encounter.originalSenderId,
          observed_aura_color: encounter.observedAuraColor,
          observed_voice_spark: encounter.observedVoiceSpark,
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
      const observedMessageDate = input.observedMessageDate ?? new Date().toISOString().slice(0, 10);
      const optimistic: Encounter = {
        id: newUuid(),
        observerProfileId: session.profileId,
        observedProfileId: input.observedProfileId,
        observedMessageBody: input.observedMessageBody,
        observedMessageDate,
        observedPinType: 'classic',
        observedRippleCount: 0,
        originalSenderId: null,
        observedAuraColor: null,
        observedVoiceSpark: null,
        observedRadianceScore: input.observedRadianceScore,
        happenedAt: new Date().toISOString(),
        encounterLatitude: null,
        encounterLongitude: null,
        rssi: input.rssi,
        pendingSync: true,
        seen: false,
        pinned: false,
        reportHits: 0,
        reported: false,
        deleted: false,
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
