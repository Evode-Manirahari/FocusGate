import { Router } from "express";
import { config } from "../config.js";
import { triage } from "../triage.js";
import {
  getActiveBlock,
  blockEndLabel,
  logMessage,
  alreadyAutoReplied,
  markAutoReplied,
} from "../store.js";
import { sendToStudent, autoReplyTwiml, emptyTwiml, isValidTwilioRequest } from "../twilio.js";

export const smsRouter = Router();

/**
 * Twilio inbound-SMS webhook. A work contact texts the FocusGate number; this decides
 * whether the message breaks through the student's study block.
 *
 * Block state machine:
 *   - inactive block -> pass straight through (forward to student, no triage)
 *   - active block   -> triage; urgent -> forward now; non-urgent -> hold + auto-reply once per sender
 */
smsRouter.post("/inbound", async (req, res) => {
  const from = String(req.body.From ?? "");
  const body = String(req.body.Body ?? "");

  const fullUrl = `${config.publicBaseUrl || `${req.protocol}://${req.get("host")}`}${req.originalUrl}`;
  if (!isValidTwilioRequest(req.header("X-Twilio-Signature"), fullUrl, req.body)) {
    res.status(403).send("invalid signature");
    return;
  }

  res.type("text/xml");
  const block = getActiveBlock();

  // No active study block — deliver normally, no filtering.
  if (!block) {
    logMessage({ from, body, receivedAt: Date.now(), duringBlock: false, outcome: "passed-through" });
    await safeForward(`[work] ${from}: ${body}`);
    res.send(emptyTwiml());
    return;
  }

  const decision = await triage(body);

  if (decision.urgent) {
    logMessage({ from, body, receivedAt: Date.now(), duringBlock: true, triage: decision, outcome: "pushed-urgent" });
    await safeForward(`🔴 URGENT work msg from ${from}: ${body}`);
    res.send(emptyTwiml());
    return;
  }

  // Non-urgent: hold it, and auto-reply once per sender per block.
  logMessage({ from, body, receivedAt: Date.now(), duringBlock: true, triage: decision, outcome: "held" });
  if (alreadyAutoReplied(from)) {
    res.send(emptyTwiml());
    return;
  }
  markAutoReplied(from);
  res.send(autoReplyTwiml(blockEndLabel()));
});

async function safeForward(text: string): Promise<void> {
  try {
    await sendToStudent(text);
  } catch (err) {
    // Never let a forwarding failure break the webhook response.
    console.error("[sms] failed to forward to student:", err);
  }
}
