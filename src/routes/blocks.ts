import { Router } from "express";
import { startBlock, endBlock, getActiveBlock, getStudentById } from "../store.js";
import { sendToStudent } from "../twilio.js";

export const blocksRouter = Router();

/** Start a study block for a student. POST /blocks/:studentId/start { durationMinutes? } */
blocksRouter.post("/:studentId/start", (req, res) => {
  const student = getStudentById(Number(req.params.studentId));
  if (!student) {
    res.status(404).json({ error: "unknown student" });
    return;
  }
  const duration = Number(req.body?.durationMinutes ?? 120);
  const block = startBlock(student.id, duration);
  res.json({ ok: true, block });
});

/** End the active block and send the held-message digest. POST /blocks/:studentId/stop */
blocksRouter.post("/:studentId/stop", async (req, res) => {
  const student = getStudentById(Number(req.params.studentId));
  if (!student) {
    res.status(404).json({ error: "unknown student" });
    return;
  }
  const held = endBlock(student.id);
  const lines = held.map((m, i) => `${i + 1}. ${m.from}: ${m.body}`);
  const digest =
    held.length === 0
      ? "Focus block done. Nothing was held — you didn't miss anything."
      : `Focus block done. ${held.length} message(s) held while you studied:\n` + lines.join("\n");
  try {
    await sendToStudent(student, digest);
  } catch (err) {
    console.error("[blocks] failed to send digest:", err);
  }
  res.json({ ok: true, heldCount: held.length, digest });
});

blocksRouter.get("/:studentId/status", (req, res) => {
  const student = getStudentById(Number(req.params.studentId));
  if (!student) {
    res.status(404).json({ error: "unknown student" });
    return;
  }
  res.json({ active: getActiveBlock(student.id) });
});
