import { localRepo } from '../../db/repositories';
import { initLocalDb } from '../../db/localDb';
import { session, setSessionIdentity } from '../../state/session';
import { supabase } from './client';
import { newUuid } from '../id';
import { triggerSyncNow } from '../sync/syncEngine';

type AuthUser = {
  id: string;
};

const OFFLINE_PROFILE_ID_KEY = 'identity.offline_profile_id';
const OFFLINE_LUME_ID_KEY = 'identity.offline_lume_id';

function lumeIdForUser(userId: string) {
  const compact = userId.replace(/-/g, '').slice(0, 12).toUpperCase();
  return `LUME-${compact}`;
}

function lumeIdForOfflineProfile(profileId: string) {
  const compact = profileId.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase();
  return `LUME-${compact || 'OFFLINE'}`;
}

function getOrCreateOfflineIdentity() {
  let profileId = localRepo.getSyncState(OFFLINE_PROFILE_ID_KEY)?.trim() ?? '';
  let lumeId = localRepo.getSyncState(OFFLINE_LUME_ID_KEY)?.trim() ?? '';

  if (!profileId.length) {
    profileId = `offline-${newUuid()}`;
    localRepo.setSyncState(OFFLINE_PROFILE_ID_KEY, profileId);
  }

  if (!lumeId.length) {
    lumeId = lumeIdForOfflineProfile(profileId);
    localRepo.setSyncState(OFFLINE_LUME_ID_KEY, lumeId);
  }

  return {
    profileId,
    lumeId,
  };
}

function applyOfflineIdentity() {
  const localIdentity = getOrCreateOfflineIdentity();
  const existingProfile = localRepo.getProfile(localIdentity.profileId);

  setSessionIdentity({
    profileId: localIdentity.profileId,
    lumeId: localIdentity.lumeId,
  });

  localRepo.upsertProfile({
    id: localIdentity.profileId,
    lumeId: localIdentity.lumeId,
    displayName: existingProfile.displayName ?? 'Offline User',
    displayNameChangedAt: existingProfile.displayNameChangedAt ?? null,
    radianceScore: existingProfile.radianceScore ?? 0,
    createdAt: new Date().toISOString(),
  });
}

export function ensureSessionIdentity() {
  if (session.isReady && session.profileId && session.lumeId) {
    return;
  }

  initLocalDb();
  applyOfflineIdentity();
}

async function ensureRemoteProfile(user: AuthUser) {
  if (!supabase) {
    throw new Error('Supabase client unavailable');
  }

  const previousProfileId = session.profileId;
  const existingLocalProfile = localRepo.getProfile(user.id);
  const defaultLumeId = lumeIdForUser(user.id);

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        lume_id: defaultLumeId,
      },
      { onConflict: 'id', ignoreDuplicates: false },
    )
    .select('id, lume_id, display_name, radiance_score, created_at')
    .single();

  if (error) {
    throw error;
  }

  const resolvedLumeId = data?.lume_id ?? defaultLumeId;

  if (previousProfileId && previousProfileId !== user.id) {
    localRepo.reassignLocalIdentity(previousProfileId, user.id, resolvedLumeId);
  }

  setSessionIdentity({
    profileId: user.id,
    lumeId: resolvedLumeId,
  });

  localRepo.upsertProfile({
    id: user.id,
    lumeId: resolvedLumeId,
    displayName: data?.display_name ?? existingLocalProfile.displayName ?? 'You',
    displayNameChangedAt: existingLocalProfile.displayNameChangedAt ?? null,
    radianceScore: data?.radiance_score ?? 0,
    createdAt: data?.created_at ?? new Date().toISOString(),
  });

  await triggerSyncNow();
}

async function resolveAuthenticatedUser() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  if (data.session?.user) {
    return data.session.user;
  }

  const anon = await supabase.auth.signInAnonymously();
  if (anon.error) {
    throw anon.error;
  }

  return anon.data.user ?? null;
}

export async function initializeAuthSession() {
  ensureSessionIdentity();

  if (!supabase) {
    return () => {};
  }

  try {
    const user = await resolveAuthenticatedUser();

    if (!user) {
      return () => {};
    }

    await ensureRemoteProfile(user);

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextUser = nextSession?.user;
      if (!nextUser) {
        applyOfflineIdentity();
        return;
      }

      try {
        await ensureRemoteProfile(nextUser);
      } catch {
        applyOfflineIdentity();
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  } catch {
    applyOfflineIdentity();
    return () => {};
  }
}
