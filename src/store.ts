import type { TriageResult } from "./triage.js";

/**
 * In-memory state for the concierge v1. One process, one operator, one student.
 * Approach A swaps this for SQLite/Postgres + per-student keying — the interface
 * is intentionally small so that swap is local.
 */

export interface StudyBlock {
  studentPhone: string;
  startedAt: number;
  endsAt: number;
}

export type MessageOutcome = "passed-through" | "pushed-urgent" | "held";

export interface LoggedMessage {
  id: number;
  from: string; // manager/coworker number
  body: string;
  receivedAt: number;
  duringBlock: boolean;
  triage?: TriageResult;
  outcome: MessageOutcome;
}

let activeBlock: StudyBlock | null = null;
const messages: LoggedMessage[] = [];
let nextId = 1;

// Senders we've already auto-replied to in the current block (one reply per sender per block).
let autoRepliedSenders = new Set<string>();

export function startBlock(studentPhone: string, durationMinutes: number): StudyBlock {
  const now = Date.now();
  activeBlock = { studentPhone, startedAt: now, endsAt: now + durationMinutes * 60_000 };
  autoRepliedSenders = new Set();
  return activeBlock;
}

export function endBlock(): LoggedMessage[] {
  const held = heldMessages();
  activeBlock = null;
  return held;
}

export function getActiveBlock(): StudyBlock | null {
  if (activeBlock && Date.now() >= activeBlock.endsAt) {
    // Auto-expire so a forgotten block doesn't trap messages forever.
    activeBlock = null;
  }
  return activeBlock;
}

export function blockEndLabel(): string {
  const b = getActiveBlock();
  if (!b) return "soon";
  return new Date(b.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function alreadyAutoReplied(sender: string): boolean {
  return autoRepliedSenders.has(sender);
}
export function markAutoReplied(sender: string): void {
  autoRepliedSenders.add(sender);
}

export function logMessage(m: Omit<LoggedMessage, "id">): LoggedMessage {
  const entry: LoggedMessage = { id: nextId++, ...m };
  messages.push(entry);
  return entry;
}

export function recentMessages(limit = 50): LoggedMessage[] {
  return messages.slice(-limit).reverse();
}

export function heldMessages(): LoggedMessage[] {
  return messages.filter((m) => m.outcome === "held");
}

/** Test helper: wipe all state. */
export function __resetStore(): void {
  activeBlock = null;
  messages.length = 0;
  nextId = 1;
  autoRepliedSenders = new Set();
}
