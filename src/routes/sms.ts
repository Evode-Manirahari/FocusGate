import { Router } from "express";
import { config } from "../config.js";
import { triage } from "../triage.js";
import {
  getStudentByFocusgateNumber,
  getActiveBlock,
  blockEndLabel,
  logMessage,
  alreadyAutoReplied,
  markAutoReplied,
  type Student,
} from "../store.js";
import { sendToStudent, autoReplyTwiml, emptyTwiml, isValidTwilioRequest } from "../twilio.js";
import { pushUrgentToStudent } from "../push.js";

export const smsRouter = Router();

/**
 * Twilio inbound-SMS webhook. A work contact texts a student's FocusGate number;
 * the `To` field tells us which student. This decides whether the message breaks
 * through that student's study block.
 */
smsRouter.post("/inbound", async (req, res) => {
  const from = String(req.body.From ?? "");
  const to = String(req.body.To ?? "");
  const body = String(req.body.Body ?? "");

  const fullUrl = `${config.publicBaseUrl || `${req.protocol}://${req.get("host")}`}${req.originalUrl}`;
  if (!isValidTwilioRequest(req.header("X-Twilio-Signature"), fullUrl, req.body)) {
    res.status(403).send("invalid signature");
    return;
  }

  const student = getStudentByFocusgateNumber(to);
  res.type("text/xml");
  if (!student) {
    // Unknown FocusGate number — not ours to handle.
    res.send(emptyTwiml());
    return;
  }

  const block = getActiveBlock(student.id);

  // No active study block — deliver normally, no filtering.
  if (!block) {
    logMessage({ studentId: student.id, from, body, receivedAt: Date.now(), duringBlock: false, outcome: "passed-through" });
    await safeForward(student, `[work] ${from}: ${body}`);
    res.send(emptyTwiml());
    return;
  }

  const decision = await triage(body);

  if (decision.urgent) {
    logMessage({ studentId: student.id, from, body, receivedAt: Date.now(), duringBlock: true, triage: decision, outcome: "pushed-urgent" });
    // Prefer the native app's Time Sensitive push (breaks through Focus); fall back to
    // SMS if the student hasn't installed/registered the app yet.
    const pushed = await pushUrgentToStudent(student, {
      title: "Urgent work message",
      body: `${from}: ${body}`,
      data: { from, reason: decision.reason },
    });
    if (!pushed) await safeForward(student, `🔴 URGENT work msg from ${from}: ${body}`);
    res.send(emptyTwiml());
    return;
  }

  // Non-urgent: hold it, and auto-reply once per sender per block.
  logMessage({ studentId: student.id, from, body, receivedAt: Date.now(), duringBlock: true, triage: decision, outcome: "held" });
  if (alreadyAutoReplied(block.id, from)) {
    res.send(emptyTwiml());
    return;
  }
  markAutoReplied(block.id, from);
  res.send(autoReplyTwiml(student.name, blockEndLabel(student.id)));
});

async function safeForward(student: Student, text: string): Promise<void> {
  try {
    await sendToStudent(student, text);
  } catch (err) {
    console.error("[sms] failed to forward to student:", err);
  }
}
