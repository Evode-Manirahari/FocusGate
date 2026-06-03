import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

export interface TriageResult {
  urgent: boolean;
  reason: string;
  /** How the decision was reached — useful for the operator dashboard + trust debugging. */
  source: "urgent-keyword" | "ai" | "fail-open";
}

/**
 * The trust floor. A sender can ALWAYS force through by writing "urgent".
 * Literal, case-insensitive substring match — no AI, no ambiguity.
 */
export function hasUrgentKeyword(body: string): boolean {
  return /urgent/i.test(body);
}

const SYSTEM_PROMPT = `You are the triage filter for FocusGate, an attention firewall for a working student who is in a focused study block right now.

A message just arrived from one of their work contacts (a manager or coworker). Decide whether it is important enough to interrupt the student's studying RIGHT NOW, or whether it can wait until their study block ends.

Interrupt (urgent=true) ONLY for things that genuinely cannot wait an hour or two, such as:
- A shift offer or shift change that needs a quick yes/no ("can you cover tonight?", "we need someone in 30 min")
- A time-sensitive work emergency ("system is down, can you come in?")
- Anything explicitly asking for an immediate reply or action

Do NOT interrupt (urgent=false) for things that can wait, such as:
- Schedule posted for next week, general announcements, "good job last night", FYIs
- Social chatter, thank-yous, non-time-sensitive questions

When genuinely unsure, lean toward urgent=true: a missed shift offer costs the student money and trust. A false interrupt is only mildly annoying.

Respond with ONLY a JSON object, no prose: {"urgent": boolean, "reason": "<short reason, <=12 words>"}`;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/**
 * Decide whether an inbound work message should break through a study block.
 *
 * Order:
 *   1. "urgent" keyword  -> always through (trust floor, no AI)
 *   2. Claude classifier -> content-aware judgment
 *   3. Any error/timeout -> fail OPEN (treat as urgent). A missed shift offer is
 *      worse than a false interrupt, so every uncertain path biases to delivery.
 */
export async function triage(body: string, opts: { timeoutMs?: number } = {}): Promise<TriageResult> {
  if (hasUrgentKeyword(body)) {
    return { urgent: true, reason: 'sender wrote "urgent"', source: "urgent-keyword" };
  }

  const anthropic = getClient();
  if (!anthropic) {
    return { urgent: true, reason: "triage unavailable (no API key) — failing open", source: "fail-open" };
  }

  try {
    const res = await anthropic.messages.create(
      {
        model: config.triageModel,
        max_tokens: 100,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            // Static system prompt is reused on every message — cache it.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: body.slice(0, 2000) }],
      },
      { timeout: opts.timeoutMs ?? 8000 },
    );

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseDecision(text);
    if (!parsed) {
      return { urgent: true, reason: "could not parse triage output — failing open", source: "fail-open" };
    }
    return { urgent: parsed.urgent, reason: parsed.reason, source: "ai" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { urgent: true, reason: `triage error (${msg}) — failing open`, source: "fail-open" };
  }
}

/** Extract the JSON decision from a model response, tolerating extra whitespace/prose. */
export function parseDecision(text: string): { urgent: boolean; reason: string } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { urgent?: unknown; reason?: unknown };
    if (typeof obj.urgent !== "boolean") return null;
    return {
      urgent: obj.urgent,
      reason: typeof obj.reason === "string" ? obj.reason : "",
    };
  } catch {
    return null;
  }
}
