import { useMutation, useQueryClient } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { newId, newUuid } from '../services/id';
import { refreshBleBroadcastPayload } from '../services/ble/BleBackgroundService';
import { triggerSyncNow } from '../services/sync/syncEngine';
import { session } from '../state/session';
import { DailyMessage, Encounter, MessagePinType } from '../types/domain';

type UpsertInput = {
  body: string;
  pinType?: MessagePinType;
  rippleCount?: number;
  originalSenderId?: string | null;
  auraColor?: string | null;
  voiceSpark?: string | null;
};

type RippleInput = {
  encounterId: string;
  body: string;
  sourceProfileId: string;
  sourceMessageDate: string;
  sourceOriginalSenderId: string | null;
  pinType: MessagePinType;
  sourceAuraColor?: string | null;
  sourceVoiceSpark?: string | null;
};

type QueueDraftInput = {
  body: string;
  pinType?: MessagePinType;
  auraColor?: string | null;
  voiceSpark?: string | null;
};

type RemoveDraftInput = {
  draftId: string;
};

export function useUpsertDailyMessage() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string; body: string }, Error, UpsertInput, { previous: DailyMessage | null }>({
    mutationFn: async ({
      body,
      pinType = 'classic',
      rippleCount = 0,
      originalSenderId = null,
      auraColor = null,
      voiceSpark = null,
    }: UpsertInput) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      const existing = localRepo.getTodayMessage(session.profileId);
      if (existing) {
        throw new Error('Daily message already saved');
      }

      const today = new Date().toISOString().slice(0, 10);
      const messageId = newUuid();
      const profile = localRepo.getProfile(session.profileId);

      localRepo.upsertDailyMessage({
        id: messageId,
        profileId: session.profileId,
        body,
        messageDate: today,
        pinType,
        rippleCount,
        originalSenderId,
        auraColor,
        voiceSpark,
        pendingSync: true,
      });

      const streakDays = localRepo.getRadianceStreak(session.profileId, today);
      const streakMultiplier = 1 + Math.min(5, Math.max(0, streakDays - 1)) * 0.15;
      const pinBonus = pinType === 'crystal' ? 4 : pinType === 'star' ? 2 : 0;
      const radianceEarned = Math.max(1, Math.round(18 * streakMultiplier) + pinBonus);

      localRepo.upsertProfile({
        ...profile,
        radianceScore: Math.max(0, profile.radianceScore + radianceEarned),
      });

      localRepo.queue({
        id: newId('out_'),
        opType: 'upsert_daily_message',
        tableName: 'messages',
        payloadJson: JSON.stringify({
          id: messageId,
          profile_id: session.profileId,
          body,
          message_date: today,
          pin_type: pinType,
          ripple_count: Math.max(0, Math.floor(rippleCount)),
          original_sender_id: originalSenderId,
          aura_color: auraColor,
          voice_spark: voiceSpark,
        }),
        createdAt: new Date().toISOString(),
      });

      await refreshBleBroadcastPayload();
      await triggerSyncNow();

      return { id: messageId, body };
    },

    onMutate: async ({
      body,
      pinType = 'classic',
      rippleCount = 0,
      originalSenderId = null,
      auraColor = null,
      voiceSpark = null,
    }: UpsertInput) => {
      if (!session.isReady) {
        return { previous: null };
      }

      await queryClient.cancelQueries({ queryKey: ['todayMessage', session.profileId] });
      const previous =
        queryClient.getQueryData<DailyMessage | null>(['todayMessage', session.profileId]) ?? null;

      const optimistic: DailyMessage = {
        id: previous?.id ?? newUuid(),
        profileId: session.profileId,
        body,
        messageDate: new Date().toISOString().slice(0, 10),
        pinType,
        rippleCount: Math.max(0, Math.floor(rippleCount)),
        originalSenderId,
        auraColor,
        voiceSpark,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pendingSync: true,
      };

      queryClient.setQueryData(['todayMessage', session.profileId], optimistic);
      return { previous };
    },

    onError: (_error: Error, _vars: UpsertInput, context: { previous: DailyMessage | null } | undefined) => {
      queryClient.setQueryData(['todayMessage', session.profileId], context?.previous ?? null);
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['todayMessage', session.profileId] });
      await queryClient.invalidateQueries({ queryKey: ['messageHistory', session.profileId] });
      await queryClient.invalidateQueries({ queryKey: ['profileStats', session.profileId] });
      await queryClient.invalidateQueries({ queryKey: ['profileDashboard', session.profileId] });
    },
  });
}

export function useQueueMessageDraft() {
  const queryClient = useQueryClient();

  return useMutation<{ draftId: string }, Error, QueueDraftInput>({
    mutationFn: async ({
      body,
      pinType = 'classic',
      auraColor = null,
      voiceSpark = null,
    }: QueueDraftInput) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      const trimmedBody = body.trim();
      if (!trimmedBody.length) {
        throw new Error('Draft message cannot be empty');
      }

      const draftId = newId('out_');
      localRepo.queueMessageDraft({
        id: draftId,
        profileId: session.profileId,
        body: trimmedBody,
        pinType,
        auraColor,
        voiceSpark,
        createdAt: new Date().toISOString(),
      });

      return { draftId };
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['queuedMessageDrafts', session.profileId] });
    },
  });
}

export function useRemoveQueuedMessageDraft() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, RemoveDraftInput>({
    mutationFn: async ({ draftId }: RemoveDraftInput) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      localRepo.removeQueuedMessageDraft(draftId);
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['queuedMessageDrafts', session.profileId] });
    },
  });
}

export function useRippleMessage() {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; body: string },
    Error,
    RippleInput,
    { previousToday: DailyMessage | null; previousPinned: Encounter[] }
  >({
    mutationFn: async (input: RippleInput) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const existingToday = localRepo.getTodayMessage(session.profileId);
      if (existingToday) {
        throw new Error('Daily message already saved');
      }

      const messageId = newUuid();
      const lineageSenderId = input.sourceOriginalSenderId ?? input.sourceProfileId;

      localRepo.upsertDailyMessage({
        id: messageId,
        profileId: session.profileId,
        body: input.body,
        messageDate: today,
        pinType: input.pinType,
        rippleCount: 0,
        originalSenderId: lineageSenderId,
        auraColor: input.sourceAuraColor ?? null,
        voiceSpark: input.sourceVoiceSpark ?? null,
        pendingSync: true,
      });

      localRepo.incrementEncounterRippleCount(input.encounterId);

      localRepo.queue({
        id: newId('out_'),
        opType: 'upsert_daily_message',
        tableName: 'messages',
        payloadJson: JSON.stringify({
          id: messageId,
          profile_id: session.profileId,
          body: input.body,
          message_date: today,
          pin_type: input.pinType,
          ripple_count: 0,
          original_sender_id: lineageSenderId,
          aura_color: input.sourceAuraColor ?? null,
          voice_spark: input.sourceVoiceSpark ?? null,
        }),
        createdAt: now,
      });

      localRepo.queue({
        id: newId('out_'),
        opType: 'increment_message_ripple',
        tableName: 'messages',
        payloadJson: JSON.stringify({
          profile_id: lineageSenderId,
          message_date: input.sourceMessageDate,
          carrier_profile_id: session.profileId,
          carrier_lume_id: session.lumeId,
        }),
        createdAt: now,
      });

      await refreshBleBroadcastPayload();
      await triggerSyncNow();

      return { id: messageId, body: input.body };
    },

    onMutate: async (input: RippleInput) => {
      if (!session.isReady) {
        return {
          previousToday: null,
          previousPinned: [],
        };
      }

      await queryClient.cancelQueries({ queryKey: ['todayMessage', session.profileId] });
      await queryClient.cancelQueries({ queryKey: ['messageHistory', session.profileId] });
      await queryClient.cancelQueries({ queryKey: ['echoPinned', session.profileId] });

      const previousToday =
        queryClient.getQueryData<DailyMessage | null>(['todayMessage', session.profileId]) ?? null;
      const previousPinned =
        queryClient.getQueryData<Encounter[]>(['echoPinned', session.profileId]) ?? [];

      if (previousToday) {
        return {
          previousToday,
          previousPinned,
        };
      }

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const lineageSenderId = input.sourceOriginalSenderId ?? input.sourceProfileId;

      const optimistic: DailyMessage = {
        id: newUuid(),
        profileId: session.profileId,
        body: input.body,
        messageDate: today,
        pinType: input.pinType,
        rippleCount: 0,
        originalSenderId: lineageSenderId,
        auraColor: input.sourceAuraColor ?? null,
        voiceSpark: input.sourceVoiceSpark ?? null,
        createdAt: now,
        updatedAt: now,
        pendingSync: true,
      };

      queryClient.setQueryData(['todayMessage', session.profileId], optimistic);

      queryClient.setQueryData<DailyMessage[]>(['messageHistory', session.profileId], (current) => {
        const currentSafe = current ?? [];
        return [optimistic, ...currentSafe.filter((item) => item.messageDate !== today)];
      });

      queryClient.setQueryData<Encounter[]>(['echoPinned', session.profileId], (current) => {
        const currentSafe = current ?? [];
        return currentSafe.map((encounter) =>
          encounter.id === input.encounterId
            ? {
                ...encounter,
                observedRippleCount: encounter.observedRippleCount + 1,
              }
            : encounter,
        );
      });

      return {
        previousToday,
        previousPinned,
      };
    },

    onError: (
      _error: Error,
      _vars: RippleInput,
      context: { previousToday: DailyMessage | null; previousPinned: Encounter[] } | undefined,
    ) => {
      queryClient.setQueryData(['todayMessage', session.profileId], context?.previousToday ?? null);
      queryClient.setQueryData(['echoPinned', session.profileId], context?.previousPinned ?? []);
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['todayMessage', session.profileId] });
      await queryClient.invalidateQueries({ queryKey: ['messageHistory', session.profileId] });
      await queryClient.invalidateQueries({ queryKey: ['echoPinned', session.profileId] });
      await queryClient.invalidateQueries({ queryKey: ['echoInbox', session.profileId] });
    },
  });
}
