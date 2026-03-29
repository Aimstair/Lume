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
      radiance_score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  conn.execute(`
    CREATE TABLE IF NOT EXISTS local_messages (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      body TEXT NOT NULL,
      message_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      pending_sync INTEGER NOT NULL DEFAULT 1
    );
  `);

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
      observed_radiance_score INTEGER NOT NULL,
      happened_at TEXT NOT NULL,
      rssi INTEGER,
      pending_sync INTEGER NOT NULL DEFAULT 1
    );
  `);

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
