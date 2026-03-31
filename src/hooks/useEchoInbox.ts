import { useQuery } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { session } from '../state/session';
import { Encounter } from '../types/domain';

export function useUnseenEchoes() {
  return useQuery<Encounter[]>({
    queryKey: ['echoInbox', session.profileId],
    queryFn: async () => localRepo.listUnseenEncounters(session.profileId),
    enabled: session.isReady,
    initialData: [],
    refetchInterval: session.isReady ? 2_000 : false,
  });
}

export function usePinnedEchoes() {
  return useQuery<Encounter[]>({
    queryKey: ['echoPinned', session.profileId],
    queryFn: async () => localRepo.listPinnedEncounters(session.profileId),
    enabled: session.isReady,
    initialData: [],
    refetchInterval: session.isReady ? 3_000 : false,
  });
}

export function useEncounterFeed() {
  return useQuery<Encounter[]>({
    queryKey: ['echoFeed', session.profileId],
    queryFn: async () => localRepo.listEncountersForFeed(session.profileId),
    enabled: session.isReady,
    initialData: [],
    refetchInterval: session.isReady ? 3_000 : false,
  });
}
