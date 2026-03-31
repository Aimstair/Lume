import { useQuery } from '@tanstack/react-query';
import { EchoOfPastSuggestion, localRepo } from '../db/repositories';
import { session } from '../state/session';

export function useEchoOfPast() {
  return useQuery<EchoOfPastSuggestion | null>({
    queryKey: ['echoOfPast', session.profileId, new Date().toISOString().slice(0, 10)],
    queryFn: async () => localRepo.getEchoOfPastSuggestion(session.profileId),
    enabled: session.isReady,
    initialData: null,
    staleTime: 60_000,
  });
}
