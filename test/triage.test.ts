import { describe, it, expect, beforeEach } from "vitest";
import { hasUrgentKeyword, parseDecision } from "../src/triage.js";
import {
  startBlock,
  getActiveBlock,
  logMessage,
  heldMessages,
  alreadyAutoReplied,
  markAutoReplied,
  endBlock,
  __resetStore,
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
    expect(parseDecision('{"urgent": "yes"}')).toBeNull(); // wrong type
    expect(parseDecision("{broken")).toBeNull();
  });
});

describe("study-block state machine", () => {
  beforeEach(() => __resetStore());

  it("has no active block by default", () => {
    expect(getActiveBlock()).toBeNull();
  });

  it("starts and reports an active block", () => {
    startBlock("+15550001111", 120);
    expect(getActiveBlock()).not.toBeNull();
  });

  it("auto-expires a block past its end time", () => {
    startBlock("+15550001111", -1); // already ended
    expect(getActiveBlock()).toBeNull();
  });

  it("auto-replies at most once per sender per block", () => {
    startBlock("+15550001111", 120);
    expect(alreadyAutoReplied("+1999")).toBe(false);
    markAutoReplied("+1999");
    expect(alreadyAutoReplied("+1999")).toBe(true);
    // new block resets the set
    startBlock("+15550001111", 120);
    expect(alreadyAutoReplied("+1999")).toBe(false);
  });

  it("collects held messages and returns them as the digest on stop", () => {
    startBlock("+15550001111", 120);
    logMessage({ from: "+1999", body: "fyi", receivedAt: Date.now(), duringBlock: true, outcome: "held" });
    logMessage({ from: "+1888", body: "🔴 cover?", receivedAt: Date.now(), duringBlock: true, outcome: "pushed-urgent" });
    expect(heldMessages()).toHaveLength(1);
    const digest = endBlock();
    expect(digest).toHaveLength(1);
    expect(digest[0]?.body).toBe("fyi");
    expect(getActiveBlock()).toBeNull();
  });
});
