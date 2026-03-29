import NetInfo from '@react-native-community/netinfo';
import { localRepo } from '../../db/repositories';
import { supabase } from '../supabase/client';

let isSyncing = false;

async function pushOutboxOnce() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    if (!supabase) return;

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    const pending = localRepo.getOutbox(100);

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payloadJson);

        if (item.opType === 'upsert_daily_message') {
          const { error } = await supabase.from('messages').upsert(payload, {
            onConflict: 'profile_id,message_date',
            ignoreDuplicates: false,
          });
          if (error) throw error;
          localRepo.markDailyMessageSynced(payload.profile_id, payload.message_date);
        }

        if (item.opType === 'insert_encounter') {
          const { error } = await supabase.from('encounters').insert(payload);
          if (error) throw error;
          localRepo.markEncounterSynced(payload.id);
        }

        if (item.opType === 'heart_reaction') {
          const { error } = await supabase.from('message_reactions').upsert(payload, {
            onConflict: 'message_id,reactor_profile_id',
            ignoreDuplicates: false,
          });
          if (error) throw error;
        }

        localRepo.removeOutbox(item.id);
      } catch (error: any) {
        localRepo.markOutboxError(item.id, error?.message ?? 'unknown sync error');
      }
    }
  } finally {
    isSyncing = false;
  }
}

export function startSyncEngine() {
  const unsubscribe = NetInfo.addEventListener((state: { isConnected: boolean | null }) => {
    if (state.isConnected) {
      pushOutboxOnce();
    }
  });

  pushOutboxOnce();

  return unsubscribe;
}

export async function triggerSyncNow() {
  await pushOutboxOnce();
}
