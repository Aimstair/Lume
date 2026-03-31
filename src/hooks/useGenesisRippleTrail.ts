import { useQuery } from '@tanstack/react-query';
import { GenesisRippleTrailItem, localRepo } from '../db/repositories';
import { session } from '../state/session';

export function useGenesisRippleTrail() {
  return useQuery<GenesisRippleTrailItem[]>({
    queryKey: ['genesisRippleTrail', session.profileId],
    queryFn: async () => localRepo.listGenesisRippleTrail(session.profileId, 80),
    enabled: session.isReady,
    initialData: [],
    refetchInterval: session.isReady ? 5_000 : false,
  });
}
