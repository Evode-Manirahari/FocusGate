import { describe, it, expect, beforeEach } from "vitest";
import { hasUrgentKeyword, parseDecision } from "../src/triage.js";
import { pushUrgentToStudent } from "../src/push.js";
import {
  createStudent,
  getStudentByFocusgateNumber,
  startBlock,
  getActiveBlock,
  logMessage,
  heldMessages,
  alreadyAutoReplied,
  markAutoReplied,
  endBlock,
  __resetStore,
  type Student,
} from "../src/store.js";

describe("hasUrgentKeyword — the trust floor", () => {
  it("matches the literal word, case-insensitively", () => {
    expect(hasUrgentKeyword("URGENT need cover")).toBe(true);
    expect(hasUrgentKeyword("this is urgent")).toBe(true);
    expect(hasUrgentKeyword("Urgent!!")).toBe(true);
  });
  it("does not fire on normal messages", () => {
    expect(hasUrgentKeyword("can you cover tonight?")).toBe(false);
    expect(hasUrgentKeyword("great job last shift")).toBe(false);
  });
});

describe("parseDecision — tolerant JSON extraction (fail-open relies on null)", () => {
  it("parses clean JSON", () => {
    expect(parseDecision('{"urgent": true, "reason": "shift offer"}')).toEqual({ urgent: true, reason: "shift offer" });
  });
  it("parses JSON embedded in prose", () => {
    expect(parseDecision('Here you go: {"urgent": false, "reason": "fyi only"} done')).toEqual({
      urgent: false,
      reason: "fyi only",
    });
  });
  it("returns null on garbage so the caller fails open", () => {
    expect(parseDecision("no json here")).toBeNull();
    expect(parseDecision('{"urgent": "yes"}')).toBeNull();
    expect(parseDecision("{broken")).toBeNull();
  });
});

describe("pushUrgentToStudent — SMS fallback gate", () => {
  it("returns false without a push token (caller falls back to SMS), no network call", async () => {
    const student = { id: 1, name: "Alex", phone: "+1500", focusgateNumber: "+1900", expoPushToken: null };
    await expect(pushUrgentToStudent(student, { title: "t", body: "b" })).resolves.toBe(false);
  });
});

describe("multi-student store (SQLite, in-memory)", () => {
  let alex: Student;
  let sam: Student;

  beforeEach(() => {
    process.env.DB_PATH = ":memory:";
    __resetStore();
    alex = createStudent({ name: "Alex", phone: "+1500000001", focusgateNumber: "+1900000001" });
    sam = createStudent({ name: "Sam", phone: "+1500000002", focusgateNumber: "+1900000002" });
  });

  it("routes a FocusGate number to the right student", () => {
    expect(getStudentByFocusgateNumber("+1900000001")?.name).toBe("Alex");
    expect(getStudentByFocusgateNumber("+1900000002")?.name).toBe("Sam");
    expect(getStudentByFocusgateNumber("+1999999999")).toBeNull();
  });

  it("keeps blocks independent per student", () => {
    startBlock(alex.id, 120);
    expect(getActiveBlock(alex.id)).not.toBeNull();
    expect(getActiveBlock(sam.id)).toBeNull(); // Sam unaffected
  });

  it("auto-expires a block past its end time", () => {
    startBlock(alex.id, -1);
    expect(getActiveBlock(alex.id)).toBeNull();
  });

  it("auto-replies at most once per sender per block, reset on a new block", () => {
    const b1 = startBlock(alex.id, 120);
    expect(alreadyAutoReplied(b1.id, "+1999")).toBe(false);
    markAutoReplied(b1.id, "+1999");
    expect(alreadyAutoReplied(b1.id, "+1999")).toBe(true);
    const b2 = startBlock(alex.id, 120);
    expect(alreadyAutoReplied(b2.id, "+1999")).toBe(false);
  });

  it("collects held messages per student and returns them as the digest on stop", () => {
    startBlock(alex.id, 120);
    logMessage({ studentId: alex.id, from: "+1999", body: "fyi", receivedAt: Date.now(), duringBlock: true, outcome: "held" });
    logMessage({ studentId: alex.id, from: "+1888", body: "cover?", receivedAt: Date.now(), duringBlock: true, outcome: "pushed-urgent" });
    logMessage({ studentId: sam.id, from: "+1777", body: "other student's note", receivedAt: Date.now(), duringBlock: true, outcome: "held" });

    expect(heldMessages(alex.id)).toHaveLength(1);
    expect(heldMessages(sam.id)).toHaveLength(1); // isolated

    const digest = endBlock(alex.id);
    expect(digest).toHaveLength(1);
    expect(digest[0]?.body).toBe("fyi");
    expect(getActiveBlock(alex.id)).toBeNull();
  });
});
