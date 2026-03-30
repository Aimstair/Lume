import { DailyMessage, Encounter, Profile } from '../types/domain';
import { inSql } from './localDb';

type OutboxItem = {
  id: string;
  opType: 'upsert_daily_message' | 'insert_encounter' | 'heart_reaction';
  tableName: 'messages' | 'encounters' | 'message_reactions';
  payloadJson: string;
  createdAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function toFlag(value: boolean) {
  return value ? 1 : 0;
}

export const localRepo = {
  getProfile(profileId: string): Profile {
    return inSql((db) => {
      const result = db.execute('SELECT * FROM local_profiles WHERE id = ? LIMIT 1;', [profileId]);
      const row = result.rows?._array?.[0];

      return {
        id: row?.id ?? profileId,
        lumeId: row?.lume_id ?? '',
        displayName: row?.display_name ?? null,
        radianceScore: row?.radiance_score ?? 0,
        createdAt: row?.updated_at ?? nowIso(),
      };
    });
  },

  upsertProfile(profile: Profile) {
    inSql((db) => {
      db.execute(
        `
        INSERT INTO local_profiles (id, lume_id, display_name, radiance_score, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET
          lume_id = excluded.lume_id,
          display_name = excluded.display_name,
          radiance_score = excluded.radiance_score,
          updated_at = excluded.updated_at;
        `,
        [profile.id, profile.lumeId, profile.displayName, profile.radianceScore, nowIso()],
      );
    });
  },

  getTodayMessage(profileId: string): DailyMessage | null {
    const today = new Date().toISOString().slice(0, 10);
    return inSql((db) => {
      const result = db.execute(
        'SELECT * FROM local_messages WHERE profile_id = ? AND message_date = ? LIMIT 1;',
        [profileId, today],
      );
      const row = result.rows?._array?.[0];
      if (!row) return null;

      return {
        id: row.id,
        profileId: row.profile_id,
        body: row.body,
        messageDate: row.message_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        pendingSync: row.pending_sync === 1,
      };
    });
  },

  listMessageHistory(profileId: string, limit = 30): DailyMessage[] {
    return inSql((db) => {
      const result = db.execute(
        `
        SELECT *
        FROM local_messages
        WHERE profile_id = ?
        ORDER BY message_date DESC, created_at DESC
        LIMIT ?;
        `,
        [profileId, limit],
      );

      const rows = result.rows?._array ?? [];
      return rows.map((row: any) => ({
        id: row.id,
        profileId: row.profile_id,
        body: row.body,
        messageDate: row.message_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        pendingSync: row.pending_sync === 1,
      }));
    });
  },

  upsertDailyMessage(input: {
    id: string;
    profileId: string;
    body: string;
    messageDate: string;
    pendingSync: boolean;
  }) {
    inSql((db) => {
      const ts = nowIso();
      db.execute(
        `
        INSERT INTO local_messages (id, profile_id, body, message_date, created_at, updated_at, pending_sync)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_id, message_date)
        DO UPDATE SET
          body = excluded.body,
          updated_at = excluded.updated_at,
          pending_sync = excluded.pending_sync;
        `,
        [
          input.id,
          input.profileId,
          input.body,
          input.messageDate,
          ts,
          ts,
          toFlag(input.pendingSync),
        ],
      );
    });
  },

  markDailyMessageSynced(profileId: string, messageDate: string) {
    inSql((db) => {
      db.execute(
        'UPDATE local_messages SET pending_sync = 0 WHERE profile_id = ? AND message_date = ?;',
        [profileId, messageDate],
      );
    });
  },

  addEncounter(encounter: Encounter) {
    inSql((db) => {
      db.execute(
        `
        INSERT INTO local_encounters (
          id,
          observer_profile_id,
          observed_profile_id,
          observed_message_body,
          observed_radiance_score,
          happened_at,
          rssi,
          pending_sync
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          encounter.id,
          encounter.observerProfileId,
          encounter.observedProfileId,
          encounter.observedMessageBody,
          encounter.observedRadianceScore,
          encounter.happenedAt,
          encounter.rssi,
          toFlag(encounter.pendingSync),
        ],
      );
    });
  },

  listEncountersForFeed(observerProfileId: string): Encounter[] {
    return inSql((db) => {
      const result = db.execute(
        'SELECT * FROM local_encounters WHERE observer_profile_id = ? ORDER BY happened_at DESC LIMIT 100;',
        [observerProfileId],
      );
      const rows = result.rows?._array ?? [];
      return rows.map((row: any) => ({
        id: row.id,
        observerProfileId: row.observer_profile_id,
        observedProfileId: row.observed_profile_id,
        observedMessageBody: row.observed_message_body,
        observedRadianceScore: row.observed_radiance_score,
        happenedAt: row.happened_at,
        rssi: row.rssi,
        pendingSync: row.pending_sync === 1,
      }));
    });
  },

  markEncounterSynced(encounterId: string) {
    inSql((db) => {
      db.execute('UPDATE local_encounters SET pending_sync = 0 WHERE id = ?;', [encounterId]);
    });
  },

  queue(item: OutboxItem) {
    inSql((db) => {
      db.execute(
        `
        INSERT INTO sync_outbox (id, op_type, table_name, payload_json, created_at, attempts, last_error)
        VALUES (?, ?, ?, ?, ?, 0, NULL);
        `,
        [item.id, item.opType, item.tableName, item.payloadJson, item.createdAt],
      );
    });
  },

  getOutbox(limit = 50): Array<OutboxItem & { attempts: number }> {
    return inSql((db) => {
      const result = db.execute(
        'SELECT * FROM sync_outbox ORDER BY created_at ASC LIMIT ?;',
        [limit],
      );
      const rows = result.rows?._array ?? [];
      return rows.map((row: any) => ({
        id: row.id,
        opType: row.op_type,
        tableName: row.table_name,
        payloadJson: row.payload_json,
        createdAt: row.created_at,
        attempts: row.attempts,
      }));
    });
  },

  removeOutbox(id: string) {
    inSql((db) => {
      db.execute('DELETE FROM sync_outbox WHERE id = ?;', [id]);
    });
  },

  markOutboxError(id: string, error: string) {
    inSql((db) => {
      db.execute(
        'UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?;',
        [error.slice(0, 500), id],
      );
    });
  },
};
