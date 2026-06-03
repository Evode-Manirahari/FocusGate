import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3000),

  dbPath: optional("DB_PATH", "focusgate.db"),

  anthropicApiKey: optional("ANTHROPIC_API_KEY"),
  triageModel: optional("TRIAGE_MODEL", "claude-haiku-4-5-20251001"),

  twilioAccountSid: optional("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: optional("TWILIO_AUTH_TOKEN"),
  focusgateNumber: optional("FOCUSGATE_NUMBER"),

  studentName: optional("STUDENT_NAME", "the student"),
  studentPhone: optional("STUDENT_PHONE"),

  // Default ON in production. Local dev with ngrok can opt out.
  validateTwilioSignature:
    (process.env.VALIDATE_TWILIO_SIGNATURE ?? (isProd ? "true" : "false")) === "true",
  publicBaseUrl: optional("PUBLIC_BASE_URL"),
};

/** Loudly warn (not crash) when running without the integrations wired up. */
export function reportConfigHealth(): void {
  const missing: string[] = [];
  if (!config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY (triage will fail-open to URGENT)");
  if (!config.twilioAccountSid || !config.twilioAuthToken) missing.push("TWILIO_* (cannot send SMS to student)");
  if (!config.focusgateNumber) missing.push("FOCUSGATE_NUMBER");
  if (!config.studentPhone) missing.push("STUDENT_PHONE (cannot forward urgent messages)");
  if (missing.length) {
    console.warn("[config] running with gaps:\n  - " + missing.join("\n  - "));
  }
  if (config.validateTwilioSignature && !config.publicBaseUrl) {
    console.warn("[config] VALIDATE_TWILIO_SIGNATURE is on but PUBLIC_BASE_URL is empty — validation will reject requests.");
  }
}
