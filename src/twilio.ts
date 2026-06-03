import twilio from "twilio";
import { config } from "./config.js";

let rest: ReturnType<typeof twilio> | null = null;
function client() {
  if (!config.twilioAccountSid || !config.twilioAuthToken) return null;
  if (!rest) rest = twilio(config.twilioAccountSid, config.twilioAuthToken);
  return rest;
}

/**
 * Forward a message to the student's real phone. In Approach C this stands in for
 * the Time Sensitive push that breaks through Focus mode; for the SMS-relay concierge
 * test, a plain SMS (or a call) to the student is enough to validate the loop.
 */
export async function sendToStudent(text: string): Promise<void> {
  const c = client();
  if (!c || !config.studentPhone || !config.focusgateNumber) {
    console.warn(`[twilio] (dry-run) -> student: ${text}`);
    return;
  }
  await c.messages.create({ from: config.focusgateNumber, to: config.studentPhone, body: text });
}

/** Build the TwiML auto-reply sent back to a non-urgent sender. */
export function autoReplyTwiml(untilLabel: string): string {
  const response = new twilio.twiml.MessagingResponse();
  response.message(
    `${config.studentName} is in a focus block until ${untilLabel}. ` +
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
