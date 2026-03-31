import { useQuery } from '@tanstack/react-query';
import { LocalLegendItem, localRepo } from '../db/repositories';
import { session } from '../state/session';

export function useLocalLegendLeaderboard() {
  return useQuery<LocalLegendItem[]>({
    queryKey: ['localLegendLeaderboard', session.profileId],
    queryFn: async () => localRepo.listLocalLegend(session.profileId, 72, 8),
    enabled: session.isReady,
    initialData: [],
    refetchInterval: session.isReady ? 8_000 : false,
  });
}
