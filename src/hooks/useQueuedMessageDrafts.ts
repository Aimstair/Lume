import { useQuery } from '@tanstack/react-query';
import { QueuedMessageDraft, localRepo } from '../db/repositories';
import { session } from '../state/session';

export function useQueuedMessageDrafts() {
  return useQuery<QueuedMessageDraft[]>({
    queryKey: ['queuedMessageDrafts', session.profileId],
    queryFn: async () => localRepo.listQueuedMessageDrafts(session.profileId, 12),
    enabled: session.isReady,
    initialData: [],
    refetchInterval: session.isReady ? 6_000 : false,
  });
}
