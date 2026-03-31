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

        if (item.opType === 'heart_reaction_by_target') {
          const { data: message, error: lookupError } = await supabase
            .from('messages')
            .select('id')
            .eq('profile_id', payload.observed_profile_id)
            .eq('message_date', payload.message_date)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lookupError) throw lookupError;
          if (!message?.id) {
            throw new Error('target message not available yet');
          }

          const { error } = await supabase.from('message_reactions').upsert(
            {
              message_id: message.id,
              reactor_profile_id: payload.reactor_profile_id,
              reaction: 'heart',
            },
            {
              onConflict: 'message_id,reactor_profile_id',
              ignoreDuplicates: false,
            },
          );
          if (error) throw error;
        }

        if (item.opType === 'increment_message_ripple') {
          const { error } = await supabase.rpc('increment_message_ripple_count', {
            target_profile_id: payload.profile_id,
            target_message_date: payload.message_date,
          });
          if (error) throw error;
        }

        if (item.opType === 'update_profile_display_name') {
          const { error } = await supabase
            .from('profiles')
            .update({
              display_name: payload.display_name,
            })
            .eq('id', payload.id);
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
