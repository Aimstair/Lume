import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { localRepo } from '../../db/repositories';
import { presentAppModal } from '../appModal';
import { supabase } from '../supabase/client';
import { newUuid } from '../id';

let isSyncing = false;
let lastSyncErrorMessage: string | null = null;
let lastPresentedSyncError = '';
let lastPresentedSyncErrorAt = 0;

const SYNC_ERROR_MODAL_COOLDOWN_MS = 6000;

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normalizePinType(value: unknown) {
  return value === 'star' || value === 'crystal' ? value : 'classic';
}

function normalizeOptionalSignal(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }

  return trimmed.slice(0, 24);
}

function toSyncErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'unknown sync error';
}

function isMissingRpcFunctionError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { message?: unknown; code?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';

  return (
    candidate.code === 'PGRST202' ||
    message.includes('Could not find the function') ||
    message.includes('does not exist')
  );
}

function maybePresentSyncFailure(errorMessage: string) {
  if (AppState.currentState !== 'active') {
    return;
  }

  const now = Date.now();
  if (
    errorMessage === lastPresentedSyncError &&
    now - lastPresentedSyncErrorAt < SYNC_ERROR_MODAL_COOLDOWN_MS
  ) {
    return;
  }

  lastPresentedSyncError = errorMessage;
  lastPresentedSyncErrorAt = now;

  presentAppModal({
    title: 'Sync delayed',
    message: `Some changes are still pending sync.\n\nReason: ${errorMessage}`,
  });
}

async function syncPendingLocalMessages(activeUserId: string): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  const pendingMessages = localRepo.listPendingDailyMessages(100);
  for (const message of pendingMessages) {
    const payload = {
      id: isUuid(message.id) ? message.id : newUuid(),
      profile_id: activeUserId,
      body: message.body,
      message_date:
        typeof message.messageDate === 'string' && message.messageDate.includes('T')
          ? message.messageDate.slice(0, 10)
          : message.messageDate,
      pin_type: normalizePinType(message.pinType),
      ripple_count: Math.max(0, Math.floor(message.rippleCount ?? 0)),
      original_sender_id: isUuid(message.originalSenderId) ? message.originalSenderId : null,
      aura_color: normalizeOptionalSignal(message.auraColor),
      voice_spark: normalizeOptionalSignal(message.voiceSpark),
    };

    const { error } = await supabase.from('messages').upsert(payload, {
      onConflict: 'uq_messages_profile_per_day',
      ignoreDuplicates: false,
    });

    if (error) {
      return `upsert_daily_message: ${toSyncErrorMessage(error)}`;
    }

    localRepo.markDailyMessageSynced(message.profileId, message.messageDate);
  }

  return null;
}

async function pushOutboxOnce(force = false) {
  if (isSyncing) return;
  isSyncing = true;

  let firstSyncFailure: string | null = null;

  try {
    if (!supabase) return;

    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) {
      firstSyncFailure = `auth: ${toSyncErrorMessage(authError)}`;
      return;
    }

    const activeUserId = authData.session?.user?.id;
    if (!activeUserId) return;

    const netState = await NetInfo.fetch();
    if (!force && netState.isConnected === false) return;

    const pending = localRepo
      .getOutbox(300)
      .filter((item) => item.opType !== 'queue_message_draft');

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payloadJson);

        if (item.opType === 'upsert_daily_message') {
          payload.profile_id = activeUserId;

          if (!isUuid(payload.id)) {
            payload.id = newUuid();
          }

          if (typeof payload.message_date === 'string' && payload.message_date.includes('T')) {
            payload.message_date = payload.message_date.slice(0, 10);
          }

          payload.pin_type = normalizePinType(payload.pin_type);
          payload.ripple_count = Math.max(0, Math.floor(Number(payload.ripple_count ?? 0)));

          if (!isUuid(payload.original_sender_id)) {
            payload.original_sender_id = null;
          }

          payload.aura_color = normalizeOptionalSignal(payload.aura_color);
          payload.voice_spark = normalizeOptionalSignal(payload.voice_spark);

          const { error } = await supabase.from('messages').upsert(payload, {
            onConflict: 'uq_messages_profile_per_day',
            ignoreDuplicates: false,
          });
          if (error) throw error;
          localRepo.markDailyMessageSynced(payload.profile_id, payload.message_date);
        }

        if (item.opType === 'insert_encounter') {
          payload.observer_profile_id = activeUserId;

          if (!isUuid(payload.observed_profile_id)) {
            localRepo.markEncounterSynced(payload.id);
            localRepo.removeOutbox(item.id);
            continue;
          }

          if (typeof payload.observed_message_date === 'string' && payload.observed_message_date.includes('T')) {
            payload.observed_message_date = payload.observed_message_date.slice(0, 10);
          }

          payload.observed_pin_type = normalizePinType(payload.observed_pin_type);

          payload.observed_ripple_count = Math.max(0, Math.floor(Number(payload.observed_ripple_count ?? 0)));

          if (!isUuid(payload.original_sender_id)) {
            payload.original_sender_id = null;
          }

          payload.observed_aura_color = normalizeOptionalSignal(payload.observed_aura_color);
          payload.observed_voice_spark = normalizeOptionalSignal(payload.observed_voice_spark);

          const { error } = await supabase.from('encounters').insert(payload);
          if (error) throw error;
          localRepo.markEncounterSynced(payload.id);
        }

        if (item.opType === 'heart_reaction') {
          const { error } = await supabase.from('message_reactions').upsert(payload, {
            onConflict: 'uq_reaction_per_message_per_reactor',
            ignoreDuplicates: false,
          });
          if (error) throw error;
        }

        if (item.opType === 'heart_reaction_by_target') {
          payload.reactor_profile_id = activeUserId;

          if (!isUuid(payload.observed_profile_id)) {
            localRepo.removeOutbox(item.id);
            continue;
          }

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
              onConflict: 'uq_reaction_per_message_per_reactor',
              ignoreDuplicates: false,
            },
          );
          if (error) throw error;
        }

        if (item.opType === 'increment_message_ripple') {
          if (!isUuid(payload.profile_id)) {
            localRepo.removeOutbox(item.id);
            continue;
          }

          const { error } = await supabase.rpc('increment_message_ripple_count', {
            target_profile_id: payload.profile_id,
            target_message_date: payload.message_date,
          });
          if (error) throw error;

          const hasCarrierIdentity = isUuid(payload.carrier_profile_id);
          if (hasCarrierIdentity) {
            const { error: notifyError } = await supabase.rpc('notify_message_carried', {
              target_profile_id: payload.profile_id,
              target_message_date: payload.message_date,
              carrier_profile_id: payload.carrier_profile_id,
              carrier_lume_id:
                typeof payload.carrier_lume_id === 'string' && payload.carrier_lume_id.trim().length
                  ? payload.carrier_lume_id.trim()
                  : null,
            });

            if (notifyError && !isMissingRpcFunctionError(notifyError)) {
              throw notifyError;
            }
          }
        }

        if (item.opType === 'update_profile_display_name') {
          payload.id = activeUserId;

          const { error } = await supabase
            .from('profiles')
            .update({
              display_name: payload.display_name,
            })
            .eq('id', payload.id);
          if (error) throw error;
        }

        localRepo.removeOutbox(item.id);
      } catch (error: unknown) {
        const syncErrorMessage = `${item.opType}: ${toSyncErrorMessage(error)}`;
        localRepo.markOutboxError(item.id, syncErrorMessage);

        if (!firstSyncFailure) {
          firstSyncFailure = syncErrorMessage;
        }

        console.warn('[syncEngine] Failed to sync outbox item', syncErrorMessage);
      }
    }

    const pendingLocalFailure = await syncPendingLocalMessages(activeUserId);
    if (pendingLocalFailure && !firstSyncFailure) {
      firstSyncFailure = pendingLocalFailure;
    }
  } finally {
    if (firstSyncFailure) {
      lastSyncErrorMessage = firstSyncFailure;

      if (force) {
        maybePresentSyncFailure(firstSyncFailure);
      }
    } else {
      lastSyncErrorMessage = null;
    }

    isSyncing = false;
  }
}

export function getLastSyncErrorMessage() {
  return lastSyncErrorMessage;
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
  await pushOutboxOnce(true);
}
