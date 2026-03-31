import { open, type QuickSQLiteConnection } from 'react-native-quick-sqlite';

let db: QuickSQLiteConnection | null = null;

export function getDb() {
  if (!db) {
    db = open({ name: 'lume.db', location: 'default' });
  }
  return db;
}

export function initLocalDb() {
  const conn = getDb();

  conn.execute(`
    CREATE TABLE IF NOT EXISTS local_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      lume_id TEXT NOT NULL,
      display_name TEXT,
      display_name_changed_at TEXT,
      radiance_score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  try {
    conn.execute('ALTER TABLE local_profiles ADD COLUMN display_name_changed_at TEXT;');
  } catch {
    // Column already exists on upgraded installs.
  }

  conn.execute(`
    CREATE TABLE IF NOT EXISTS local_messages (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      body TEXT NOT NULL,
      message_date TEXT NOT NULL,
      pin_type TEXT NOT NULL DEFAULT 'classic',
      ripple_count INTEGER NOT NULL DEFAULT 0,
      original_sender_id TEXT,
      aura_color TEXT,
      voice_spark TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      pending_sync INTEGER NOT NULL DEFAULT 1
    );
  `);

  try {
    conn.execute(`
      ALTER TABLE local_messages
      ADD COLUMN pin_type TEXT NOT NULL DEFAULT 'classic';
    `);
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute(`
      UPDATE local_messages
      SET pin_type = 'classic'
      WHERE pin_type IS NULL OR pin_type = '';
    `);
  } catch {
    // no-op
  }

  try {
    conn.execute(`
      ALTER TABLE local_messages
      ADD COLUMN ripple_count INTEGER NOT NULL DEFAULT 0;
    `);
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute(`
      UPDATE local_messages
      SET ripple_count = 0
      WHERE ripple_count IS NULL;
    `);
  } catch {
    // no-op
  }

  try {
    conn.execute('ALTER TABLE local_messages ADD COLUMN original_sender_id TEXT;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('ALTER TABLE local_messages ADD COLUMN aura_color TEXT;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('ALTER TABLE local_messages ADD COLUMN voice_spark TEXT;');
  } catch {
    // Column already exists on upgraded installs.
  }

  conn.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_local_messages_profile_day
    ON local_messages(profile_id, message_date);
  `);

  conn.execute(`
    CREATE TABLE IF NOT EXISTS local_encounters (
      id TEXT PRIMARY KEY NOT NULL,
      observer_profile_id TEXT NOT NULL,
      observed_profile_id TEXT NOT NULL,
      observed_message_body TEXT NOT NULL,
      observed_message_date TEXT NOT NULL,
      observed_pin_type TEXT NOT NULL DEFAULT 'classic',
      observed_ripple_count INTEGER NOT NULL DEFAULT 0,
      original_sender_id TEXT,
      observed_aura_color TEXT,
      observed_voice_spark TEXT,
      observed_radiance_score INTEGER NOT NULL,
      happened_at TEXT NOT NULL,
      encounter_latitude REAL,
      encounter_longitude REAL,
      rssi INTEGER,
      pending_sync INTEGER NOT NULL DEFAULT 1,
      is_seen INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      report_hits INTEGER NOT NULL DEFAULT 0,
      is_reported INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );
  `);

  try {
    conn.execute(
      'ALTER TABLE local_encounters ADD COLUMN observed_message_date TEXT NOT NULL DEFAULT "";',
    );
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute(
      'UPDATE local_encounters SET observed_message_date = substr(happened_at, 1, 10) WHERE observed_message_date = "" OR observed_message_date IS NULL;',
    );
  } catch {
    // no-op
  }

  try {
    conn.execute(
      'ALTER TABLE local_encounters ADD COLUMN observed_pin_type TEXT NOT NULL DEFAULT "classic";',
    );
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute(
      'UPDATE local_encounters SET observed_pin_type = "classic" WHERE observed_pin_type = "" OR observed_pin_type IS NULL;',
    );
  } catch {
    // no-op
  }

  try {
    conn.execute(
      'ALTER TABLE local_encounters ADD COLUMN observed_ripple_count INTEGER NOT NULL DEFAULT 0;',
    );
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute(
      'UPDATE local_encounters SET observed_ripple_count = 0 WHERE observed_ripple_count IS NULL;',
    );
  } catch {
    // no-op
  }

  try {
    conn.execute('ALTER TABLE local_encounters ADD COLUMN original_sender_id TEXT;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('ALTER TABLE local_encounters ADD COLUMN observed_aura_color TEXT;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('ALTER TABLE local_encounters ADD COLUMN observed_voice_spark TEXT;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('ALTER TABLE local_encounters ADD COLUMN encounter_latitude REAL;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('ALTER TABLE local_encounters ADD COLUMN encounter_longitude REAL;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('ALTER TABLE local_encounters ADD COLUMN is_seen INTEGER NOT NULL DEFAULT 0;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('ALTER TABLE local_encounters ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('ALTER TABLE local_encounters ADD COLUMN report_hits INTEGER NOT NULL DEFAULT 0;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('UPDATE local_encounters SET report_hits = 0 WHERE report_hits IS NULL;');
  } catch {
    // no-op
  }

  try {
    conn.execute('ALTER TABLE local_encounters ADD COLUMN is_reported INTEGER NOT NULL DEFAULT 0;');
  } catch {
    // Column already exists on upgraded installs.
  }

  try {
    conn.execute('ALTER TABLE local_encounters ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;');
  } catch {
    // Column already exists on upgraded installs.
  }

  conn.execute(`
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      op_type TEXT NOT NULL,
      table_name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
  `);

  conn.execute(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}

export function inSql<T>(fn: (conn: QuickSQLiteConnection) => T): T {
  const conn = getDb();
  return fn(conn);
}
