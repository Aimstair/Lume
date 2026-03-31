import { DailyMessage, Encounter, MessagePinType, Profile } from '../types/domain';
import { inSql } from './localDb';

type OutboxItem = {
  id: string;
  opType:
    | 'upsert_daily_message'
    | 'queue_message_draft'
    | 'insert_encounter'
    | 'heart_reaction'
    | 'heart_reaction_by_target'
    | 'increment_message_ripple'
    | 'update_profile_display_name';
  tableName: 'messages' | 'encounters' | 'message_reactions' | 'profiles';
  payloadJson: string;
  createdAt: string;
};

export type GenesisRippleTrailItem = {
  encounterId: string;
  carrierProfileId: string;
  happenedAt: string;
  messageDate: string;
  messagePreview: string;
  rippleCount: number;
  latitude: number | null;
  longitude: number | null;
};

export type LocalLegendItem = {
  profileId: string;
  radianceScore: number;
  encounterCount: number;
  lastSeenAt: string;
  avgLatitude: number | null;
  avgLongitude: number | null;
};

export type QueuedMessageDraft = {
  id: string;
  profileId: string;
  body: string;
  pinType: MessagePinType;
  auraColor: string | null;
  voiceSpark: string | null;
  createdAt: string;
};

export type EchoOfPastSuggestion = {
  id: string;
  body: string;
  messageDate: string;
  pinType: MessagePinType;
  rippleCount: number;
  source: 'anniversary' | 'carried';
};

export type SparkHotspot = {
  latitude: number;
  longitude: number;
  sparkCount: number;
  weight: number;
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
    observedAuraColor: row.observed_aura_color ?? null,
    observedVoiceSpark: row.observed_voice_spark ?? null,
    observedRadianceScore: row.observed_radiance_score,
    happenedAt: row.happened_at,
    encounterLatitude: toNullableNumber(row.encounter_latitude),
    encounterLongitude: toNullableNumber(row.encounter_longitude),
    rssi: row.rssi,
    pendingSync: row.pending_sync === 1,
    seen: row.is_seen === 1,
    pinned: row.is_pinned === 1,
    reportHits: Number(row.report_hits ?? 0),
    reported: row.is_reported === 1,
    deleted: row.is_deleted === 1,
  };
}

export const localRepo = {
  getSyncState(key: string): string | null {
    return inSql((db) => {
      const result = db.execute('SELECT value FROM sync_state WHERE key = ? LIMIT 1;', [key]);
      const row = result.rows?._array?.[0];
      return typeof row?.value === 'string' ? row.value : null;
    });
  },

  setSyncState(key: string, value: string) {
    inSql((db) => {
      db.execute(
        `
        INSERT INTO sync_state (key, value)
        VALUES (?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value;
        `,
        [key, value],
      );
    });
  },

  reassignLocalIdentity(fromProfileId: string, toProfileId: string, toLumeId: string) {
    if (!fromProfileId || !toProfileId || fromProfileId === toProfileId) {
      return;
    }

    inSql((db) => {
      const sourceProfile = db.execute(
        'SELECT * FROM local_profiles WHERE id = ? LIMIT 1;',
        [fromProfileId],
      ).rows?._array?.[0];
      const targetProfile = db.execute(
        'SELECT * FROM local_profiles WHERE id = ? LIMIT 1;',
        [toProfileId],
      ).rows?._array?.[0];

      const mergedDisplayName =
        targetProfile?.display_name ?? sourceProfile?.display_name ?? null;
      const mergedDisplayNameChangedAt =
        targetProfile?.display_name_changed_at ?? sourceProfile?.display_name_changed_at ?? null;
      const mergedRadianceScore = Math.max(
        Number(targetProfile?.radiance_score ?? 0),
        Number(sourceProfile?.radiance_score ?? 0),
      );
      const mergedLumeId = toLumeId || targetProfile?.lume_id || sourceProfile?.lume_id || '';

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
          toProfileId,
          mergedLumeId,
          mergedDisplayName,
          mergedDisplayNameChangedAt,
          mergedRadianceScore,
          nowIso(),
        ],
      );

      db.execute('UPDATE OR REPLACE local_messages SET profile_id = ? WHERE profile_id = ?;', [
        toProfileId,
        fromProfileId,
      ]);

      db.execute('UPDATE local_encounters SET observer_profile_id = ? WHERE observer_profile_id = ?;', [
        toProfileId,
        fromProfileId,
      ]);

      const fromQuoted = `"${fromProfileId}"`;
      const toQuoted = `"${toProfileId}"`;
      db.execute(
        'UPDATE sync_outbox SET payload_json = REPLACE(payload_json, ?, ?) WHERE payload_json LIKE ?;',
        [fromQuoted, toQuoted, `%${fromProfileId}%`],
      );

      db.execute('DELETE FROM local_profiles WHERE id = ?;', [fromProfileId]);
    });
  },

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
        auraColor: row.aura_color ?? null,
        voiceSpark: row.voice_spark ?? null,
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
        auraColor: row.aura_color ?? null,
        voiceSpark: row.voice_spark ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        pendingSync: row.pending_sync === 1,
      }));
    });
  },

  listPendingDailyMessages(limit = 100): DailyMessage[] {
    return inSql((db) => {
      const result = db.execute(
        `
        SELECT *
        FROM local_messages
        WHERE pending_sync = 1
        ORDER BY updated_at ASC
        LIMIT ?;
        `,
        [limit],
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
        auraColor: row.aura_color ?? null,
        voiceSpark: row.voice_spark ?? null,
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
    auraColor?: string | null;
    voiceSpark?: string | null;
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
          aura_color,
          voice_spark,
          created_at,
          updated_at,
          pending_sync
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_id, message_date)
        DO UPDATE SET
          body = excluded.body,
          pin_type = excluded.pin_type,
          ripple_count = excluded.ripple_count,
          original_sender_id = excluded.original_sender_id,
          aura_color = excluded.aura_color,
          voice_spark = excluded.voice_spark,
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
          input.auraColor ?? null,
          input.voiceSpark ?? null,
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

  getRadianceStreak(profileId: string, anchorDate = new Date().toISOString().slice(0, 10)) {
    return inSql((db) => {
      const result = db.execute(
        `
        SELECT DISTINCT message_date
        FROM local_messages
        WHERE profile_id = ?
        ORDER BY message_date DESC
        LIMIT 400;
        `,
        [profileId],
      );

      const rows = result.rows?._array ?? [];
      const daySet = new Set(rows.map((row: any) => String(row.message_date)));

      const cursor = new Date(`${anchorDate}T00:00:00.000Z`);
      let streak = 0;

      while (true) {
        const cursorKey = cursor.toISOString().slice(0, 10);
        if (!daySet.has(cursorKey)) {
          break;
        }

        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }

      return streak;
    });
  },

  getEchoOfPastSuggestion(profileId: string): EchoOfPastSuggestion | null {
    const today = new Date();
    const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return inSql((db) => {
      const anniversaryResult = db.execute(
        `
        SELECT id, body, message_date, pin_type, ripple_count
        FROM local_messages
        WHERE profile_id = ?
          AND substr(message_date, 6, 5) = ?
          AND message_date < ?
        ORDER BY ripple_count DESC, message_date DESC
        LIMIT 1;
        `,
        [profileId, monthDay, today.toISOString().slice(0, 10)],
      );

      const anniversary = anniversaryResult.rows?._array?.[0];
      if (anniversary) {
        return {
          id: String(anniversary.id),
          body: String(anniversary.body ?? ''),
          messageDate: String(anniversary.message_date ?? ''),
          pinType: (anniversary.pin_type ?? 'classic') as MessagePinType,
          rippleCount: Number(anniversary.ripple_count ?? 0),
          source: 'anniversary',
        };
      }

      const carriedResult = db.execute(
        `
        SELECT id, body, message_date, pin_type, ripple_count
        FROM local_messages
        WHERE profile_id = ?
          AND original_sender_id IS NOT NULL
        ORDER BY ripple_count DESC, message_date DESC
        LIMIT 1;
        `,
        [profileId],
      );

      const carried = carriedResult.rows?._array?.[0];
      if (!carried) {
        return null;
      }

      return {
        id: String(carried.id),
        body: String(carried.body ?? ''),
        messageDate: String(carried.message_date ?? ''),
        pinType: (carried.pin_type ?? 'classic') as MessagePinType,
        rippleCount: Number(carried.ripple_count ?? 0),
        source: 'carried',
      };
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
          observed_aura_color,
          observed_voice_spark,
          observed_radiance_score,
          happened_at,
          encounter_latitude,
          encounter_longitude,
          rssi,
          pending_sync,
          is_seen,
          is_pinned,
          report_hits,
          is_reported,
          is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
          encounter.observedAuraColor ?? null,
          encounter.observedVoiceSpark ?? null,
          encounter.observedRadianceScore,
          encounter.happenedAt,
          encounter.encounterLatitude,
          encounter.encounterLongitude,
          encounter.rssi,
          toFlag(encounter.pendingSync),
          toFlag(encounter.seen),
          toFlag(encounter.pinned),
          Math.max(0, Math.floor(encounter.reportHits ?? 0)),
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

  listGenesisRippleTrail(profileId: string, limit = 60): GenesisRippleTrailItem[] {
    return inSql((db) => {
      const result = db.execute(
        `
        SELECT
          id,
          observed_profile_id,
          observed_message_date,
          observed_message_body,
          observed_ripple_count,
          happened_at,
          encounter_latitude,
          encounter_longitude
        FROM local_encounters
        WHERE observer_profile_id = ?
          AND original_sender_id = ?
          AND is_deleted = 0
          AND is_reported = 0
        ORDER BY happened_at DESC
        LIMIT ?;
        `,
        [profileId, profileId, limit],
      );

      const rows = result.rows?._array ?? [];
      return rows.map((row: any) => ({
        encounterId: String(row.id),
        carrierProfileId: String(row.observed_profile_id),
        happenedAt: String(row.happened_at),
        messageDate: String(row.observed_message_date ?? row.happened_at?.slice(0, 10) ?? ''),
        messagePreview: String(row.observed_message_body ?? ''),
        rippleCount: Number(row.observed_ripple_count ?? 0),
        latitude: toNullableNumber(row.encounter_latitude),
        longitude: toNullableNumber(row.encounter_longitude),
      }));
    });
  },

  listLocalLegend(observerProfileId: string, recentHours = 72, limit = 8): LocalLegendItem[] {
    const minHappenedAt = new Date(Date.now() - Math.max(1, recentHours) * 60 * 60 * 1000).toISOString();

    return inSql((db) => {
      const result = db.execute(
        `
        SELECT
          observed_profile_id,
          MAX(observed_radiance_score) AS max_radiance,
          COUNT(*) AS encounter_count,
          MAX(happened_at) AS last_seen_at,
          AVG(encounter_latitude) AS avg_latitude,
          AVG(encounter_longitude) AS avg_longitude
        FROM local_encounters
        WHERE observer_profile_id = ?
          AND is_deleted = 0
          AND is_reported = 0
          AND happened_at >= ?
        GROUP BY observed_profile_id
        ORDER BY max_radiance DESC, encounter_count DESC, last_seen_at DESC
        LIMIT ?;
        `,
        [observerProfileId, minHappenedAt, limit],
      );

      const rows = result.rows?._array ?? [];
      return rows.map((row: any) => ({
        profileId: String(row.observed_profile_id),
        radianceScore: Number(row.max_radiance ?? 0),
        encounterCount: Number(row.encounter_count ?? 0),
        lastSeenAt: String(row.last_seen_at ?? ''),
        avgLatitude: toNullableNumber(row.avg_latitude),
        avgLongitude: toNullableNumber(row.avg_longitude),
      }));
    });
  },

  listSparkHotspots(observerProfileId: string, limit = 16): SparkHotspot[] {
    return inSql((db) => {
      const result = db.execute(
        `
        SELECT
          ROUND(encounter_latitude, 3) AS lat_bucket,
          ROUND(encounter_longitude, 3) AS lon_bucket,
          COUNT(*) AS spark_count,
          SUM(CASE WHEN observed_ripple_count > 0 THEN observed_ripple_count ELSE 1 END) AS spark_weight
        FROM local_encounters
        WHERE observer_profile_id = ?
          AND is_pinned = 1
          AND is_deleted = 0
          AND encounter_latitude IS NOT NULL
          AND encounter_longitude IS NOT NULL
        GROUP BY lat_bucket, lon_bucket
        ORDER BY spark_weight DESC, spark_count DESC
        LIMIT ?;
        `,
        [observerProfileId, limit],
      );

      const rows = result.rows?._array ?? [];
      return rows
        .map((row: any) => ({
          latitude: Number(row.lat_bucket),
          longitude: Number(row.lon_bucket),
          sparkCount: Number(row.spark_count ?? 0),
          weight: Number(row.spark_weight ?? 0),
        }))
        .filter(
          (item) =>
            Number.isFinite(item.latitude) &&
            Number.isFinite(item.longitude) &&
            item.sparkCount > 0,
        );
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
    return inSql((db) => {
      db.execute(
        `
        UPDATE local_encounters
        SET is_seen = 1,
            report_hits = report_hits + 1,
            is_pinned = CASE
              WHEN observed_pin_type = 'crystal' AND (report_hits + 1) < 2 THEN is_pinned
              ELSE 0
            END,
            is_reported = CASE
              WHEN observed_pin_type = 'crystal' AND (report_hits + 1) < 2 THEN 0
              ELSE 1
            END
        WHERE id = ?;
        `,
        [encounterId],
      );

      const result = db.execute(
        'SELECT observed_pin_type, report_hits, is_reported FROM local_encounters WHERE id = ? LIMIT 1;',
        [encounterId],
      );

      const row = result.rows?._array?.[0];
      const pinType = (row?.observed_pin_type ?? 'classic') as MessagePinType;
      const requiredHits = pinType === 'crystal' ? 2 : 1;

      return {
        pinType,
        reportHits: Number(row?.report_hits ?? 0),
        requiredHits,
        isReported: row?.is_reported === 1,
      };
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

  queueMessageDraft(input: {
    profileId: string;
    body: string;
    pinType: MessagePinType;
    auraColor?: string | null;
    voiceSpark?: string | null;
    createdAt: string;
    id: string;
  }) {
    localRepo.queue({
      id: input.id,
      opType: 'queue_message_draft',
      tableName: 'messages',
      payloadJson: JSON.stringify({
        profile_id: input.profileId,
        body: input.body,
        pin_type: input.pinType,
        aura_color: input.auraColor ?? null,
        voice_spark: input.voiceSpark ?? null,
      }),
      createdAt: input.createdAt,
    });
  },

  listQueuedMessageDrafts(profileId: string, limit = 10): QueuedMessageDraft[] {
    const rows = localRepo.getOutbox(200).filter((item) => item.opType === 'queue_message_draft');

    const parsed: QueuedMessageDraft[] = [];
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payloadJson) as {
          profile_id?: unknown;
          body?: unknown;
          pin_type?: unknown;
          aura_color?: unknown;
          voice_spark?: unknown;
        };

        const draftProfileId = typeof payload.profile_id === 'string' ? payload.profile_id : '';
        if (draftProfileId !== profileId) {
          continue;
        }

        parsed.push({
          id: row.id,
          profileId,
          body: typeof payload.body === 'string' ? payload.body : '',
          pinType:
            payload.pin_type === 'star' || payload.pin_type === 'crystal'
              ? payload.pin_type
              : 'classic',
          auraColor: typeof payload.aura_color === 'string' ? payload.aura_color : null,
          voiceSpark: typeof payload.voice_spark === 'string' ? payload.voice_spark : null,
          createdAt: row.createdAt,
        });
      } catch {
        // Ignore malformed draft payload rows.
      }
    }

    return parsed
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, Math.max(1, limit));
  },

  removeQueuedMessageDraft(draftId: string) {
    localRepo.removeOutbox(draftId);
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
