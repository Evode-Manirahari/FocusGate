# FocusGate — native client (Expo)

The student-facing app. Its only job in v1: receive the **urgent** work message as a
**Time Sensitive** push that breaks through iOS Focus mode, and start/stop study blocks.

Everything smart (triage, holding, digests) lives in the backend. This app is a thin
client — that's the whole point of the server-side relay architecture.

## Why this app has to exist (and web push can't)

iOS web push **cannot** send interruption-level (Time Sensitive) notifications, so it
can't pierce Focus mode — the one thing v1 must do. A native app declaring the
`com.apple.developer.usernotifications.time-sensitive` entitlement (see `app.json`) can.

## Prereqs

- An Apple Developer account (Time Sensitive entitlement + real-device push require it).
- An [EAS](https://docs.expo.dev/eas/) project. Put its id in `app.json` →
  `extra.eas.projectId`.
- The FocusGate backend running and reachable from the phone (use your machine's LAN IP
  or a tunnel, not `localhost`, when testing on a device).

## Run

```bash
cd app
npm install
npx expo install            # reconcile native module versions to this Expo SDK
npx expo run:ios            # dev build on a connected device (NOT a simulator — push needs a device)
```

In the app:
1. Set **Backend URL** (e.g. `http://192.168.1.20:3000`) and **Student ID**.
2. Tap **Connect notifications** — grants permission and registers the Expo push token
   with the backend.
3. Tap **Start focus block**. Have someone text the student's FocusGate number with an
   urgent shift message ("can you cover tonight?"). It should break through as a Time
   Sensitive push even with Focus on.

## How the breakthrough works

```
backend triage = urgent
   → POST exp.host/--/api/v2/push/send  { interruptionLevel: "time-sensitive", priority: "high" }
   → Expo → APNs → device  → pierces Focus mode (if user left Time Sensitive allowed)
```

If the student hasn't connected the app (no push token), the backend falls back to SMS.

## Note for CI

This app is a separate project from the backend and is **not** built by the root CI
(which only typechecks/tests `src/`). Native builds run through EAS, which needs Apple
credentials.
