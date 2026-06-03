import { getDb, __closeDb } from "./db.js";
import type { TriageResult } from "./triage.js";

/**
 * Persistent, multi-student state. Each student is reached on their own FocusGate
 * number (managers text that number), so inbound messages are keyed by the `To`
 * number -> student. Storage is SQLite so blocks and held messages survive restarts.
 */

export interface Student {
  id: number;
  name: string;
  phone: string;
  focusgateNumber: string;
  expoPushToken: string | null;
}

export interface StudyBlock {
  id: number;
  studentId: number;
  startedAt: number;
  endsAt: number;
}

export type MessageOutcome = "passed-through" | "pushed-urgent" | "held";

export interface LoggedMessage {
  id: number;
  studentId: number;
  from: string;
  body: string;
  receivedAt: number;
  duringBlock: boolean;
  triage?: TriageResult;
  outcome: MessageOutcome;
}

// --- students ---

export function createStudent(input: { name: string; phone: string; focusgateNumber: string }): Student {
  const db = getDb();
  const info = db
    .prepare(`INSERT INTO students (name, phone, focusgate_number, created_at) VALUES (?, ?, ?, ?)`)
    .run(input.name, input.phone, input.focusgateNumber, Date.now());
  return getStudentById(Number(info.lastInsertRowid))!;
}

/** Create the student if their FocusGate number isn't registered yet; otherwise return existing. */
export function upsertStudentByNumber(input: { name: string; phone: string; focusgateNumber: string }): Student {
  return getStudentByFocusgateNumber(input.focusgateNumber) ?? createStudent(input);
}

export function getStudentById(id: number): Student | null {
  return mapStudent(getDb().prepare(`SELECT * FROM students WHERE id = ?`).get(id));
}
export function getStudentByFocusgateNumber(num: string): Student | null {
  return mapStudent(getDb().prepare(`SELECT * FROM students WHERE focusgate_number = ?`).get(num));
}
export function listStudents(): Student[] {
  return getDb()
    .prepare(`SELECT * FROM students ORDER BY id`)
    .all()
    .map((r) => mapStudent(r)!);
}
export function setPushToken(studentId: number, token: string): void {
  getDb().prepare(`UPDATE students SET expo_push_token = ? WHERE id = ?`).run(token, studentId);
}

// --- blocks ---

export function startBlock(studentId: number, durationMinutes: number): StudyBlock {
  const db = getDb();
  db.prepare(`UPDATE blocks SET active = 0 WHERE student_id = ? AND active = 1`).run(studentId);
  const now = Date.now();
  const endsAt = now + durationMinutes * 60_000;
  const info = db
    .prepare(`INSERT INTO blocks (student_id, started_at, ends_at, active) VALUES (?, ?, ?, 1)`)
    .run(studentId, now, endsAt);
  return { id: Number(info.lastInsertRowid), studentId, startedAt: now, endsAt };
}

/** Active block for a student, or null. Auto-expires past its end time. */
export function getActiveBlock(studentId: number): StudyBlock | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM blocks WHERE student_id = ? AND active = 1`).get(studentId) as
    | { id: number; student_id: number; started_at: number; ends_at: number }
    | undefined;
  if (!row) return null;
  if (Date.now() >= row.ends_at) {
    db.prepare(`UPDATE blocks SET active = 0 WHERE id = ?`).run(row.id);
    return null;
  }
  return { id: row.id, studentId: row.student_id, startedAt: row.started_at, endsAt: row.ends_at };
}

/** End the active block; return the messages held during it (the digest). */
export function endBlock(studentId: number): LoggedMessage[] {
  const db = getDb();
  const block = db.prepare(`SELECT id FROM blocks WHERE student_id = ? AND active = 1`).get(studentId) as
    | { id: number }
    | undefined;
  db.prepare(`UPDATE blocks SET active = 0 WHERE student_id = ? AND active = 1`).run(studentId);
  if (!block) return [];
  return heldMessages(studentId);
}

export function blockEndLabel(studentId: number): string {
  const b = getActiveBlock(studentId);
  if (!b) return "soon";
  return new Date(b.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// --- auto-reply dedup (one reply per sender per block) ---

export function alreadyAutoReplied(blockId: number, sender: string): boolean {
  return !!getDb().prepare(`SELECT 1 FROM auto_replies WHERE block_id = ? AND sender = ?`).get(blockId, sender);
}
export function markAutoReplied(blockId: number, sender: string): void {
  getDb()
    .prepare(`INSERT OR IGNORE INTO auto_replies (block_id, sender) VALUES (?, ?)`)
    .run(blockId, sender);
}

// --- messages ---

export function logMessage(m: Omit<LoggedMessage, "id">): LoggedMessage {
  const info = getDb()
    .prepare(
      `INSERT INTO messages (student_id, from_number, body, received_at, during_block, triage_urgent, triage_reason, triage_source, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      m.studentId,
      m.from,
      m.body,
      m.receivedAt,
      m.duringBlock ? 1 : 0,
      m.triage ? (m.triage.urgent ? 1 : 0) : null,
      m.triage?.reason ?? null,
      m.triage?.source ?? null,
      m.outcome,
    );
  return { id: Number(info.lastInsertRowid), ...m };
}

export function recentMessages(studentId: number, limit = 50): LoggedMessage[] {
  return getDb()
    .prepare(`SELECT * FROM messages WHERE student_id = ? ORDER BY id DESC LIMIT ?`)
    .all(studentId, limit)
    .map(mapMessage);
}

export function heldMessages(studentId: number): LoggedMessage[] {
  return getDb()
    .prepare(`SELECT * FROM messages WHERE student_id = ? AND outcome = 'held' ORDER BY id`)
    .all(studentId)
    .map(mapMessage);
}

// --- mappers / test helper ---

function mapStudent(r: unknown): Student | null {
  if (!r) return null;
  const row = r as { id: number; name: string; phone: string; focusgate_number: string; expo_push_token: string | null };
  return { id: row.id, name: row.name, phone: row.phone, focusgateNumber: row.focusgate_number, expoPushToken: row.expo_push_token };
}

function mapMessage(r: unknown): LoggedMessage {
  const row = r as {
    id: number;
    student_id: number;
    from_number: string;
    body: string;
    received_at: number;
    during_block: number;
    triage_urgent: number | null;
    triage_reason: string | null;
    triage_source: string | null;
    outcome: MessageOutcome;
  };
  return {
    id: row.id,
    studentId: row.student_id,
    from: row.from_number,
    body: row.body,
    receivedAt: row.received_at,
    duringBlock: !!row.during_block,
    triage:
      row.triage_source != null
        ? { urgent: !!row.triage_urgent, reason: row.triage_reason ?? "", source: row.triage_source as TriageResult["source"] }
        : undefined,
    outcome: row.outcome,
  };
}

/** Test helper: wipe all data by rebuilding the (in-memory) db. */
export function __resetStore(): void {
  const db = getDb();
  db.exec(`DELETE FROM auto_replies; DELETE FROM messages; DELETE FROM blocks; DELETE FROM students;`);
  __closeDb();
}
