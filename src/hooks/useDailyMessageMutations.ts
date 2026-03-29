import { useMutation, useQueryClient } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { newId } from '../services/id';
import { triggerSyncNow } from '../services/sync/syncEngine';
import { session } from '../state/session';
import { DailyMessage } from '../types/domain';

type Input = { body: string };

export function useUpsertDailyMessage() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string; body: string }, Error, Input, { previous: DailyMessage | null }>({
    mutationFn: async ({ body }: Input) => {
      if (!session.isReady) {
        throw new Error('Session not ready');
      }

      const today = new Date().toISOString().slice(0, 10);
      const messageId = newId('msg_');

      localRepo.upsertDailyMessage({
        id: messageId,
        profileId: session.profileId,
        body,
        messageDate: today,
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
        }),
        createdAt: new Date().toISOString(),
      });

      await triggerSyncNow();

      return { id: messageId, body };
    },

    onMutate: async ({ body }: Input) => {
      if (!session.isReady) {
        return { previous: null };
      }

      await queryClient.cancelQueries({ queryKey: ['todayMessage', session.profileId] });
      const previous =
        queryClient.getQueryData<DailyMessage | null>(['todayMessage', session.profileId]) ?? null;

      const optimistic: DailyMessage = {
        id: previous?.id ?? newId('msg_'),
        profileId: session.profileId,
        body,
        messageDate: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pendingSync: true,
      };

      queryClient.setQueryData(['todayMessage', session.profileId], optimistic);
      return { previous };
    },

    onError: (_error: Error, _vars: Input, context: { previous: DailyMessage | null } | undefined) => {
      queryClient.setQueryData(['todayMessage', session.profileId], context?.previous ?? null);
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['todayMessage', session.profileId] });
    },
  });
}
