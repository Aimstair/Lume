import { useQuery } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { session } from '../state/session';
import { Encounter } from '../types/domain';

export function useEchoFeed() {
  return useQuery<Encounter[]>({
    queryKey: ['echoFeed', session.profileId],
    queryFn: async () => localRepo.listEncountersForFeed(session.profileId),
    enabled: session.isReady,
    initialData: [],
  });
}
