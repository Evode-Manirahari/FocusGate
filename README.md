# FocusGate

**An AI attention firewall for working students.** When a student is studying, FocusGate
reads the messages from their work contacts, lets the one that matters ("can you cover
tonight?") break through, and holds the rest until the study block ends — so they stay
reachable without becoming distractible.

## Why this exists (and what it deliberately is *not*)

Your phone's Focus / Do Not Disturb already blocks apps and breaks through on **sender**.
It cannot break through on **content** — "ok love you 👍" interrupts exactly as hard as
"I'm in the ER." FocusGate owns the one thing the OS won't do: **reading the message and
judging whether it's worth the interruption.**

So FocusGate does **not** block apps (the OS does that, for free, better). It is a
**server-side relay**: work messages flow through a number FocusGate controls, it triages
them with Claude, and only the urgent ones reach the student. Because the logic lives on
the server, the same backend works on iOS and Android — no notification interception, which
iOS forbids anyway.

This repo is the **v1 relay backend** plus a thin native client. The backend is scoped
for the concierge test (see below) and the real Approach C build at the same time.

- **Backend** (this directory) — Twilio relay + Claude triage + study blocks + dashboard.
- **Native app** ([`app/`](./app)) — Expo client that receives the urgent message as an
  iOS **Time Sensitive** push that breaks through Focus mode (the one thing web push and
  the OS won't do). The backend falls back to SMS when the app isn't connected.

## How a message flows

```
manager texts FocusGate number
        │
        ▼
  POST /sms/inbound  (Twilio webhook)
        │
   active study block?
    ├─ no  → forward to student normally (no triage)
    └─ yes → triage(body)
              ├─ contains "urgent"  → push to student now           (trust floor, no AI)
              ├─ Claude: urgent     → push to student now
              ├─ Claude: not urgent → hold + auto-reply once/sender
              └─ any error/timeout  → push to student now           (fail OPEN)
```

Design rule: **every uncertain path biases toward delivery.** A false interrupt is mildly
annoying; a missed shift offer costs money and trust, and trust is the whole product.

## Setup

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY, TWILIO_*, FOCUSGATE_NUMBER, STUDENT_PHONE
npm run dev
```

Expose it to Twilio (local dev):

```bash
npx ngrok http 3000
# In the Twilio console, set the FocusGate number's "A message comes in" webhook to:
#   https://<your-ngrok>.ngrok.io/sms/inbound   (HTTP POST)
```

Open the operator dashboard at **http://localhost:3000/**.

## The concierge test (run this before scaling anything)

The pain is validated (working students described it unprompted). What's *not* yet proven
is that they'll **route their texts through FocusGate and trust it**. Test that with text
threads, not a codebase:

1. Set `STUDENT_NAME` / `STUDENT_PHONE` to a real working student who has the pain.
2. They tell their manager: "text me at `<FocusGate number>`."
3. On the dashboard, click **Start block** when they sit down to study.
4. Watch each incoming message: what the AI decided and why. Urgent ones reach the student;
   the rest are held and auto-replied.
5. Click **Stop & send digest** when the block ends.
6. Afterward ask the student: *did you focus, and did you trust it enough to stop checking?*

If yes → build out Approach A (native app, push, multi-student). If they won't route their
texts or keep checking anyway → that's the real problem to solve, not the code.

## Multiple students at once

State is persisted in SQLite (`DB_PATH`), so blocks and held messages survive restarts,
and you can run several concierge tests in parallel. Each student needs their **own**
FocusGate number — inbound messages are routed to a student by the `To` number.

```bash
# register a student (or set STUDENT_* env to seed one on startup)
curl -X POST localhost:3000/students -H 'content-type: application/json' \
  -d '{"name":"Sam","phone":"+1555...","focusgateNumber":"+1900..."}'
```

| endpoint | what |
| --- | --- |
| `GET /students` | list registered students |
| `POST /students` | register `{ name, phone, focusgateNumber }` |
| `POST /students/:id/push-token` | register an Expo push token (native client) |
| `POST /blocks/:id/start` | start a study block `{ durationMinutes? }` |
| `POST /blocks/:id/stop` | end block, send the held-message digest |
| `POST /sms/inbound` | Twilio webhook (routes by `To` number) |

The operator dashboard shows one section per student.

## Commands

| command | what |
| --- | --- |
| `npm run dev` | run with hot reload (tsx) |
| `npm run build` | compile to `dist/` |
| `npm start` | run the compiled server |
| `npm run typecheck` | type-check only |
| `npm test` | run the unit tests (triage + block state machine) |

## Security notes

- Twilio webhook signatures are verified when `NODE_ENV=production` (or
  `VALIDATE_TWILIO_SIGNATURE=true`). Set `PUBLIC_BASE_URL` so the signed URL matches.
- Secrets live in `.env` (gitignored). Never commit real keys.

## Status

v1 relay backend + operator dashboard. Roadmap: native push client (break through iOS
Focus via Time Sensitive notifications), per-student keying + persistence, multi-channel
(email/Slack), and a learning importance model. See the design doc for the full plan.
