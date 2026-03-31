import { useMutation, useQueryClient } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { newId, newUuid } from '../services/id';
import { notifyEchoReceived } from '../services/notifications';
import { triggerSyncNow } from '../services/sync/syncEngine';
import { getBestEffortEncounterCoordinates } from '../services/location/encounterLocation';
import { session } from '../state/session';
import { Encounter, MessagePinType } from '../types/domain';

const SAMPLE_MESSAGES = [
  'I finally took a deep breath and chose peace over pressure.',
  'Sending calm energy to everyone moving through a heavy day.',
  'Tiny progress is still progress. Keep going.',
  'Today I am choosing kindness, especially toward myself.',
  'Hope this finds someone who needed a little light.',
  'You are allowed to restart your day at any moment.',
];

const SAMPLE_PIN_TYPES: MessagePinType[] = ['classic', 'star', 'crystal'];

function randomMessage() {
  const index = Math.floor(Math.random() * SAMPLE_MESSAGES.length);
  return SAMPLE_MESSAGES[index] ?? SAMPLE_MESSAGES[0];
}

function randomSignalStrength() {
  const min = -85;
  const max = -45;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPinType() {
  const index = Math.floor(Math.random() * SAMPLE_PIN_TYPES.length);
  return SAMPLE_PIN_TYPES[index] ?? 'classic';
}

export function useSimulateIncomingEcho() {
  const queryClient = useQueryClient();

  return useMutation<{ encounterId: string }, Error, { message?: string } | void>({
    mutationFn: async (input) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      const now = new Date();
      const happenedAt = now.toISOString();
      const observedMessageDate = happenedAt.slice(0, 10);
      const simulatedProfileId = `sim-${Math.random().toString(36).slice(2, 10)}`;
      const body = input?.message?.trim().length ? input.message.trim() : randomMessage();
      const pinType = randomPinType();
      const encounterCoordinates = await getBestEffortEncounterCoordinates();

      const encounter: Encounter = {
        id: newUuid(),
        observerProfileId: session.profileId,
        observedProfileId: simulatedProfileId,
        observedMessageBody: body,
        observedMessageDate,
        observedPinType: pinType,
        observedRippleCount: 0,
        originalSenderId: null,
        observedRadianceScore: Math.floor(Math.random() * 450) + 100,
        happenedAt,
        encounterLatitude: encounterCoordinates?.latitude ?? null,
        encounterLongitude: encounterCoordinates?.longitude ?? null,
        rssi: randomSignalStrength(),
        pendingSync: true,
        seen: false,
        pinned: false,
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
          observed_radiance_score: encounter.observedRadianceScore,
          happened_at: encounter.happenedAt,
          rssi: encounter.rssi,
        }),
        createdAt: happenedAt,
      });

      const unseenCount = localRepo.countUnseenEncounters(session.profileId);
      await notifyEchoReceived(unseenCount, encounter.observedMessageBody);
      void triggerSyncNow();

      return { encounterId: encounter.id };
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['echoInbox', session.profileId] });
      await queryClient.invalidateQueries({ queryKey: ['echoPinned', session.profileId] });
      await queryClient.invalidateQueries({ queryKey: ['echoFeed', session.profileId] });
    },
  });
}
