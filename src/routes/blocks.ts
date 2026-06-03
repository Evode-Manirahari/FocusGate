import { Router } from "express";
import { config } from "../config.js";
import { startBlock, endBlock, getActiveBlock } from "../store.js";
import { sendToStudent } from "../twilio.js";

export const blocksRouter = Router();

/** Start a study block. Body: { durationMinutes?: number } */
blocksRouter.post("/start", (req, res) => {
  if (!config.studentPhone) {
    res.status(400).json({ error: "STUDENT_PHONE not configured" });
    return;
  }
  const duration = Number(req.body?.durationMinutes ?? 120);
  const block = startBlock(config.studentPhone, duration);
  res.json({ ok: true, block });
});

/** End the active block and send the held-message digest to the student. */
blocksRouter.post("/stop", async (_req, res) => {
  const held = endBlock();
  const lines = held.map((m, i) => `${i + 1}. ${m.from}: ${m.body}`);
  const digest =
    held.length === 0
      ? "Focus block done. Nothing was held — you didn't miss anything."
      : `Focus block done. ${held.length} message(s) held while you studied:\n` + lines.join("\n");
  try {
    await sendToStudent(digest);
  } catch (err) {
    console.error("[blocks] failed to send digest:", err);
  }
  res.json({ ok: true, heldCount: held.length, digest });
});

blocksRouter.get("/status", (_req, res) => {
  res.json({ active: getActiveBlock() });
});
