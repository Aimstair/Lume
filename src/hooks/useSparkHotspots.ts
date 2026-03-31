import { useQuery } from '@tanstack/react-query';
import { SparkHotspot, localRepo } from '../db/repositories';
import { session } from '../state/session';

export function useSparkHotspots() {
  return useQuery<SparkHotspot[]>({
    queryKey: ['sparkHotspots', session.profileId],
    queryFn: async () => localRepo.listSparkHotspots(session.profileId, 18),
    enabled: session.isReady,
    initialData: [],
    refetchInterval: session.isReady ? 8_000 : false,
  });
}
