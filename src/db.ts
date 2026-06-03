import Database from "better-sqlite3";
import { config } from "./config.js";

/**
 * Single SQLite connection for the process. Path comes from config (DB_PATH),
 * defaulting to a file; tests set ":memory:" for isolation.
 */
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  // Read env at connection time so tests can point at ":memory:" before first use.
  db = new Database(process.env.DB_PATH || config.dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      focusgate_number TEXT NOT NULL UNIQUE,
      expo_push_token TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      started_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_student ON blocks(student_id, active);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      from_number TEXT NOT NULL,
      body TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      during_block INTEGER NOT NULL,
      triage_urgent INTEGER,
      triage_reason TEXT,
      triage_source TEXT,
      outcome TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_student ON messages(student_id, id);

    CREATE TABLE IF NOT EXISTS auto_replies (
      block_id INTEGER NOT NULL REFERENCES blocks(id),
      sender TEXT NOT NULL,
      PRIMARY KEY (block_id, sender)
    );
  `);
}

/** Test helper: drop the connection so the next getDb() rebuilds (used with DB_PATH=:memory:). */
export function __closeDb(): void {
  db?.close();
  db = null;
}
