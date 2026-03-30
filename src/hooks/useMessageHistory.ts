import { useQuery } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { session } from '../state/session';
import { DailyMessage } from '../types/domain';

export function useMessageHistory() {
  return useQuery<DailyMessage[]>({
    queryKey: ['messageHistory', session.profileId],
    queryFn: async () => localRepo.listMessageHistory(session.profileId, 60),
    enabled: session.isReady,
    initialData: [],
  });
}
