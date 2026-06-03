import twilio from "twilio";
import { config } from "./config.js";
import type { Student } from "./store.js";

let rest: ReturnType<typeof twilio> | null = null;
function client() {
  if (!config.twilioAccountSid || !config.twilioAuthToken) return null;
  if (!rest) rest = twilio(config.twilioAccountSid, config.twilioAuthToken);
  return rest;
}

/**
 * Forward a message to the student's real phone, sent from their FocusGate number.
 * In Approach C this stands in for the Time Sensitive push that breaks through Focus
 * mode; for the SMS-relay concierge test, a plain SMS to the student validates the loop.
 */
export async function sendToStudent(student: Student, text: string): Promise<void> {
  const c = client();
  if (!c || !student.phone || !student.focusgateNumber) {
    console.warn(`[twilio] (dry-run) -> ${student.name}: ${text}`);
    return;
  }
  await c.messages.create({ from: student.focusgateNumber, to: student.phone, body: text });
}

/** Build the TwiML auto-reply sent back to a non-urgent sender. */
export function autoReplyTwiml(studentName: string, untilLabel: string): string {
  const response = new twilio.twiml.MessagingResponse();
  response.message(
    `${studentName} is in a focus block until ${untilLabel}. ` +
      `Your message was saved and they'll see it then. Reply with the word URGENT if it can't wait.`,
  );
  return response.toString();
}

/** Empty TwiML — acknowledge the webhook without sending a reply. */
export function emptyTwiml(): string {
  return new twilio.twiml.MessagingResponse().toString();
}

/** Validate that an inbound webhook actually came from Twilio. */
export function isValidTwilioRequest(signature: string | undefined, url: string, params: Record<string, unknown>): boolean {
  if (!config.validateTwilioSignature) return true;
  if (!signature || !config.twilioAuthToken) return false;
  return twilio.validateRequest(config.twilioAuthToken, signature, url, params as Record<string, string>);
}
