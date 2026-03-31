import { useQuery } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { session } from '../state/session';

export function useProfileDashboard() {
  const profileQuery = useQuery({
    queryKey: ['profileDashboard', session.profileId],
    queryFn: async () => localRepo.getProfile(session.profileId),
    enabled: session.isReady,
    initialData: {
      id: session.profileId || 'pending',
      lumeId: session.lumeId || 'PENDING',
      displayName: 'You',
      displayNameChangedAt: null,
      radianceScore: 0,
      createdAt: new Date().toISOString(),
    },
  });

  const statsQuery = useQuery({
    queryKey: ['profileStats', session.profileId],
    queryFn: async () => {
      const encounters = localRepo.listEncountersForFeed(session.profileId);
      const messages = localRepo.listMessageHistory(session.profileId, 365);
      const streakDays = localRepo.getRadianceStreak(session.profileId);
      return {
        encountersCount: encounters.length,
        dailyMessagesCount: messages.length,
        heartsReceived: Math.floor(profileQuery.data.radianceScore / 5),
        streakDays,
      };
    },
    enabled: session.isReady,
    initialData: {
      encountersCount: 0,
      dailyMessagesCount: 0,
      heartsReceived: 0,
      streakDays: 0,
    },
  });

  return {
    profile: profileQuery.data,
    stats: statsQuery.data,
  };
}
