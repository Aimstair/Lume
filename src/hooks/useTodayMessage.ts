import { useQuery } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { session } from '../state/session';
import { DailyMessage } from '../types/domain';

export function useTodayMessage() {
  return useQuery<DailyMessage | null>({
    queryKey: ['todayMessage', session.profileId],
    queryFn: async () => localRepo.getTodayMessage(session.profileId),
    enabled: session.isReady,
    initialData: null,
  });
}
