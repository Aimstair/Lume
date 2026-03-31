import { DailyMessage, Encounter, MessagePinType, Profile } from '../types/domain';
import { inSql } from './localDb';

type OutboxItem = {
  id: string;
  opType:
    | 'upsert_daily_message'
    | 'insert_encounter'
    | 'heart_reaction'
    | 'heart_reaction_by_target'
    | 'increment_message_ripple'
    | 'update_profile_display_name';
  tableName: 'messages' | 'encounters' | 'message_reactions' | 'profiles';
  payloadJson: string;
  createdAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function toFlag(value: boolean) {
  return value ? 1 : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function mapEncounterRow(row: any): Encounter {
  return {
    id: row.id,
    observerProfileId: row.observer_profile_id,
    observedProfileId: row.observed_profile_id,
    observedMessageBody: row.observed_message_body,
    observedMessageDate: row.observed_message_date,
    observedPinType: (row.observed_pin_type ?? 'classic') as MessagePinType,
    observedRippleCount: Number(row.observed_ripple_count ?? 0),
    originalSenderId: row.original_sender_id ?? null,
    observedRadianceScore: row.observed_radiance_score,
    happenedAt: row.happened_at,
    encounterLatitude: toNullableNumber(row.encounter_latitude),
    encounterLongitude: toNullableNumber(row.encounter_longitude),
    rssi: row.rssi,
    pendingSync: row.pending_sync === 1,
    seen: row.is_seen === 1,
    pinned: row.is_pinned === 1,
    reported: row.is_reported === 1,
    deleted: row.is_deleted === 1,
  };
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
        displayNameChangedAt: row?.display_name_changed_at ?? null,
        radianceScore: row?.radiance_score ?? 0,
        createdAt: row?.updated_at ?? nowIso(),
      };
    });
  },

  upsertProfile(profile: Profile) {
    inSql((db) => {
      db.execute(
        `
        INSERT INTO local_profiles (id, lume_id, display_name, display_name_changed_at, radiance_score, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET
          lume_id = excluded.lume_id,
          display_name = excluded.display_name,
          display_name_changed_at = excluded.display_name_changed_at,
          radiance_score = excluded.radiance_score,
          updated_at = excluded.updated_at;
        `,
        [
          profile.id,
          profile.lumeId,
          profile.displayName,
          profile.displayNameChangedAt,
          profile.radianceScore,
          nowIso(),
        ],
      );
    });
  },

  updateProfileDisplayName(profileId: string, displayName: string, changedAt: string) {
    inSql((db) => {
      db.execute(
        `
        UPDATE local_profiles
        SET display_name = ?,
            display_name_changed_at = ?,
            updated_at = ?
        WHERE id = ?;
        `,
        [displayName, changedAt, nowIso(), profileId],
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
        pinType: (row.pin_type ?? 'classic') as MessagePinType,
        rippleCount: Number(row.ripple_count ?? 0),
        originalSenderId: row.original_sender_id ?? null,
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
        pinType: (row.pin_type ?? 'classic') as MessagePinType,
        rippleCount: Number(row.ripple_count ?? 0),
        originalSenderId: row.original_sender_id ?? null,
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
    pinType?: MessagePinType;
    rippleCount?: number;
    originalSenderId?: string | null;
    pendingSync: boolean;
  }) {
    inSql((db) => {
      const ts = nowIso();
      db.execute(
        `
        INSERT INTO local_messages (
          id,
          profile_id,
          body,
          message_date,
          pin_type,
          ripple_count,
          original_sender_id,
          created_at,
          updated_at,
          pending_sync
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_id, message_date)
        DO UPDATE SET
          body = excluded.body,
          pin_type = excluded.pin_type,
          ripple_count = excluded.ripple_count,
          original_sender_id = excluded.original_sender_id,
          updated_at = excluded.updated_at,
          pending_sync = excluded.pending_sync;
        `,
        [
          input.id,
          input.profileId,
          input.body,
          input.messageDate,
          input.pinType ?? 'classic',
          Math.max(0, Math.floor(input.rippleCount ?? 0)),
          input.originalSenderId ?? null,
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
          observed_message_date,
          observed_pin_type,
          observed_ripple_count,
          original_sender_id,
          observed_radiance_score,
          happened_at,
          encounter_latitude,
          encounter_longitude,
          rssi,
          pending_sync,
          is_seen,
          is_pinned,
          is_reported,
          is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          encounter.id,
          encounter.observerProfileId,
          encounter.observedProfileId,
          encounter.observedMessageBody,
          encounter.observedMessageDate,
          encounter.observedPinType,
          Math.max(0, Math.floor(encounter.observedRippleCount)),
          encounter.originalSenderId,
          encounter.observedRadianceScore,
          encounter.happenedAt,
          encounter.encounterLatitude,
          encounter.encounterLongitude,
          encounter.rssi,
          toFlag(encounter.pendingSync),
          toFlag(encounter.seen),
          toFlag(encounter.pinned),
          toFlag(encounter.reported),
          toFlag(encounter.deleted),
        ],
      );
    });
  },

  listEncountersForFeed(observerProfileId: string): Encounter[] {
    return inSql((db) => {
      const result = db.execute(
        `
        SELECT *
        FROM local_encounters
        WHERE observer_profile_id = ?
          AND is_deleted = 0
          AND is_reported = 0
        ORDER BY happened_at DESC
        LIMIT 100;
        `,
        [observerProfileId],
      );
      const rows = result.rows?._array ?? [];
      return rows.map(mapEncounterRow);
    });
  },

  listUnseenEncounters(observerProfileId: string, limit = 50): Encounter[] {
    return inSql((db) => {
      const result = db.execute(
        `
        SELECT *
        FROM local_encounters
        WHERE observer_profile_id = ?
          AND is_seen = 0
          AND is_deleted = 0
          AND is_reported = 0
        ORDER BY happened_at DESC
        LIMIT ?;
        `,
        [observerProfileId, limit],
      );

      const rows = result.rows?._array ?? [];
      return rows.map(mapEncounterRow);
    });
  },

  listPinnedEncounters(observerProfileId: string, limit = 200): Encounter[] {
    return inSql((db) => {
      const result = db.execute(
        `
        SELECT *
        FROM local_encounters
        WHERE observer_profile_id = ?
          AND is_pinned = 1
          AND is_deleted = 0
          AND is_reported = 0
        ORDER BY happened_at DESC
        LIMIT ?;
        `,
        [observerProfileId, limit],
      );

      const rows = result.rows?._array ?? [];
      return rows.map(mapEncounterRow);
    });
  },

  countUnseenEncounters(observerProfileId: string) {
    return inSql((db) => {
      const result = db.execute(
        `
        SELECT COUNT(*) AS total
        FROM local_encounters
        WHERE observer_profile_id = ?
          AND is_seen = 0
          AND is_deleted = 0
          AND is_reported = 0;
        `,
        [observerProfileId],
      );
      const row = result.rows?._array?.[0];
      return Number(row?.total ?? 0);
    });
  },

  hasEncounterForMessageDay(observerProfileId: string, observedProfileId: string, observedMessageDate: string) {
    return inSql((db) => {
      const result = db.execute(
        `
        SELECT id
        FROM local_encounters
        WHERE observer_profile_id = ?
          AND observed_profile_id = ?
          AND observed_message_date = ?
          AND is_deleted = 0
        LIMIT 1;
        `,
        [observerProfileId, observedProfileId, observedMessageDate],
      );
      return Boolean(result.rows?._array?.[0]?.id);
    });
  },

  markEncounterSeen(encounterId: string) {
    inSql((db) => {
      db.execute('UPDATE local_encounters SET is_seen = 1 WHERE id = ?;', [encounterId]);
    });
  },

  pinEncounter(encounterId: string) {
    inSql((db) => {
      db.execute(
        'UPDATE local_encounters SET is_seen = 1, is_pinned = 1, is_reported = 0, is_deleted = 0 WHERE id = ?;',
        [encounterId],
      );
    });
  },

  incrementEncounterRippleCount(encounterId: string) {
    inSql((db) => {
      db.execute(
        'UPDATE local_encounters SET observed_ripple_count = observed_ripple_count + 1 WHERE id = ?;',
        [encounterId],
      );
    });
  },

  reportEncounter(encounterId: string) {
    inSql((db) => {
      db.execute(
        'UPDATE local_encounters SET is_seen = 1, is_reported = 1, is_pinned = 0 WHERE id = ?;',
        [encounterId],
      );
    });
  },

  deleteEncounter(encounterId: string) {
    inSql((db) => {
      db.execute(
        'UPDATE local_encounters SET is_seen = 1, is_deleted = 1, is_pinned = 0 WHERE id = ?;',
        [encounterId],
      );
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
