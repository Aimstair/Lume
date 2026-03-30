import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase/client';
import { session } from '../state/session';

type DailyMessageStats = {
  receivedUsersCount: number;
  isRemoteAvailable: boolean;
};

function utcDayBounds(date: Date) {
  const day = date.toISOString().slice(0, 10);
  const dayStart = `${day}T00:00:00.000Z`;

  const endDate = new Date(`${dayStart}`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);

  return {
    dayStart,
    dayEnd: endDate.toISOString(),
  };
}

export function useDailyMessageStats() {
  return useQuery<DailyMessageStats>({
    queryKey: ['dailyMessageStats', session.profileId, new Date().toISOString().slice(0, 10)],
    queryFn: async () => {
      if (!supabase || !session.isReady) {
        return {
          receivedUsersCount: 0,
          isRemoteAvailable: false,
        };
      }

      const { dayStart, dayEnd } = utcDayBounds(new Date());

      const { data, error } = await supabase
        .from('encounters')
        .select('observer_profile_id')
        .eq('observed_profile_id', session.profileId)
        .gte('happened_at', dayStart)
        .lt('happened_at', dayEnd);

      if (error) {
        return {
          receivedUsersCount: 0,
          isRemoteAvailable: true,
        };
      }

      const uniqueReceivers = new Set((data ?? []).map((row: any) => row.observer_profile_id)).size;

      return {
        receivedUsersCount: uniqueReceivers,
        isRemoteAvailable: true,
      };
    },
    enabled: session.isReady,
    initialData: {
      receivedUsersCount: 0,
      isRemoteAvailable: Boolean(supabase),
    },
    staleTime: 30_000,
  });
}
