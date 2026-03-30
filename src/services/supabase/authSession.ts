import { localRepo } from '../../db/repositories';
import { clearSessionIdentity, setSessionIdentity } from '../../state/session';
import { supabase } from './client';

type AuthUser = {
  id: string;
};

function lumeIdForUser(userId: string) {
  const compact = userId.replace(/-/g, '').slice(0, 12).toUpperCase();
  return `LUME-${compact}`;
}

function applyOfflineIdentity() {
  const localId = 'offline-local-user';
  const localLumeId = 'LUME-OFFLINE-LOCAL';

  setSessionIdentity({
    profileId: localId,
    lumeId: localLumeId,
  });

  localRepo.upsertProfile({
    id: localId,
    lumeId: localLumeId,
    displayName: 'Offline User',
    radianceScore: 0,
    createdAt: new Date().toISOString(),
  });
}

async function ensureRemoteProfile(user: AuthUser) {
  if (!supabase) {
    throw new Error('Supabase client unavailable');
  }

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

  setSessionIdentity({
    profileId: user.id,
    lumeId: resolvedLumeId,
  });

  localRepo.upsertProfile({
    id: user.id,
    lumeId: resolvedLumeId,
    displayName: data?.display_name ?? 'You',
    radianceScore: data?.radiance_score ?? 0,
    createdAt: data?.created_at ?? new Date().toISOString(),
  });
}

async function resolveAuthenticatedUser() {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    return data.session.user;
  }

  const anon = await supabase.auth.signInAnonymously();
  return anon.data.user ?? null;
}

export async function initializeAuthSession() {
  if (!supabase) {
    applyOfflineIdentity();

    return () => {};
  }

  try {
    const user = await resolveAuthenticatedUser();

    if (!user) {
      applyOfflineIdentity();
      return () => {};
    }

    await ensureRemoteProfile(user);

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextUser = nextSession?.user;
      if (!nextUser) {
        clearSessionIdentity();
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
