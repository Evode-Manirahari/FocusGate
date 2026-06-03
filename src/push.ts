import type { Student } from "./store.js";

/**
 * Send a push to the student's native FocusGate app via the Expo push service.
 *
 * On iOS this is the real urgent-breakthrough path: `interruptionLevel:
 * "time-sensitive"` lets the notification pierce Focus mode (provided the app has the
 * Time Sensitive Notifications capability and the user has allowed it). This is the one
 * thing the OS won't do for arbitrary apps and the reason the native client exists.
 *
 * Returns true if a push was dispatched, false if the student has no token (caller
 * then falls back to SMS).
 */
export async function pushUrgentToStudent(
  student: Student,
  msg: { title: string; body: string; data?: Record<string, unknown> },
): Promise<boolean> {
  if (!student.expoPushToken) return false;

  const payload = {
    to: student.expoPushToken,
    title: msg.title,
    body: msg.body,
    sound: "default",
    priority: "high",
    // Apple interruption level — the field that breaks through Focus.
    interruptionLevel: "time-sensitive",
    data: msg.data ?? {},
  };

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[push] Expo push failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[push] Expo push error:", err);
    return false;
  }
}
