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
};

type RippleInput = {
  encounterId: string;
  body: string;
  sourceProfileId: string;
  sourceMessageDate: string;
  sourceOriginalSenderId: string | null;
  pinType: MessagePinType;
};

export function useUpsertDailyMessage() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string; body: string }, Error, UpsertInput, { previous: DailyMessage | null }>({
    mutationFn: async ({ body, pinType = 'classic', rippleCount = 0, originalSenderId = null }: UpsertInput) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      const existing = localRepo.getTodayMessage(session.profileId);
      if (existing) {
        throw new Error('Daily message already saved');
      }

      const today = new Date().toISOString().slice(0, 10);
      const messageId = newUuid();

      localRepo.upsertDailyMessage({
        id: messageId,
        profileId: session.profileId,
        body,
        messageDate: today,
        pinType,
        rippleCount,
        originalSenderId,
        pendingSync: true,
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
        }),
        createdAt: new Date().toISOString(),
      });

      await refreshBleBroadcastPayload();
      await triggerSyncNow();

      return { id: messageId, body };
    },

    onMutate: async ({ body, pinType = 'classic', rippleCount = 0, originalSenderId = null }: UpsertInput) => {
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
      const messageId = existingToday?.id ?? newUuid();
      const lineageSenderId = input.sourceOriginalSenderId ?? input.sourceProfileId;

      localRepo.upsertDailyMessage({
        id: messageId,
        profileId: session.profileId,
        body: input.body,
        messageDate: today,
        pinType: input.pinType,
        rippleCount: 0,
        originalSenderId: lineageSenderId,
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

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const lineageSenderId = input.sourceOriginalSenderId ?? input.sourceProfileId;

      const optimistic: DailyMessage = {
        id: previousToday?.id ?? newUuid(),
        profileId: session.profileId,
        body: input.body,
        messageDate: today,
        pinType: input.pinType,
        rippleCount: 0,
        originalSenderId: lineageSenderId,
        createdAt: previousToday?.createdAt ?? now,
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
