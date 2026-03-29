import { initLocalDb } from '../db/localDb';
import { startSyncEngine } from './sync/syncEngine';
import { initializeAuthSession } from './supabase/authSession';

let stopSync: (() => void) | null = null;
let stopAuth: (() => void) | null = null;

export function bootstrapApp() {
  initLocalDb();

  stopSync = startSyncEngine();

  initializeAuthSession()
    .then((unsubscribe) => {
      stopAuth = unsubscribe;
    })
    .catch(() => {
      // Keep app running locally even if auth bootstrap fails; retry happens on next app start.
    });
}

export function teardownApp() {
  if (stopSync) {
    stopSync();
    stopSync = null;
  }

  if (stopAuth) {
    stopAuth();
    stopAuth = null;
  }
}
