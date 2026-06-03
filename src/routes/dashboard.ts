import { Router } from "express";
import { config } from "../config.js";
import { getActiveBlock, recentMessages, heldMessages, blockEndLabel } from "../store.js";

export const dashboardRouter = Router();

/**
 * Operator dashboard for the concierge test. The founder watches this during a real
 * study block to see, per message, what the AI decided and why — the raw material for
 * "did the right message get through, did the noise stay out."
 */
dashboardRouter.get("/", (_req, res) => {
  const block = getActiveBlock();
  const msgs = recentMessages();
  const held = heldMessages();

  const outcomeBadge: Record<string, string> = {
    "pushed-urgent": "#d33",
    held: "#888",
    "passed-through": "#369",
  };

  const rows = msgs
    .map((m) => {
      const color = outcomeBadge[m.outcome] ?? "#444";
      const reason = m.triage ? `${m.triage.reason} (${m.triage.source})` : "—";
      const time = new Date(m.receivedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
      return `<tr>
        <td class="t">${time}</td>
        <td>${esc(m.from)}</td>
        <td>${esc(m.body)}</td>
        <td><span class="badge" style="background:${color}">${m.outcome}</span></td>
        <td class="reason">${esc(reason)}</td>
      </tr>`;
    })
    .join("");

  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>FocusGate — operator</title>
<meta http-equiv="refresh" content="5"/>
<style>
  :root { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
  body { margin: 0; background: #0f1115; color: #e6e6e6; }
  header { padding: 16px 20px; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 16px; }
  h1 { font-size: 16px; margin: 0; letter-spacing: .02em; }
  .status { font-size: 13px; padding: 4px 10px; border-radius: 999px; }
  .on { background: #14361f; color: #6ee79b; }
  .off { background: #2a2a2a; color: #aaa; }
  main { padding: 20px; }
  .controls { margin-bottom: 18px; display: flex; gap: 10px; align-items: center; }
  button, input { font-size: 14px; padding: 8px 12px; border-radius: 8px; border: 1px solid #333; background: #1b1e24; color: #e6e6e6; }
  button { cursor: pointer; }
  button.primary { background: #2563eb; border-color: #2563eb; }
  button.stop { background: #3a1414; border-color: #5a1d1d; color: #ffb4b4; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #1d1f25; vertical-align: top; }
  th { color: #8a8f98; font-weight: 600; }
  .t { color: #8a8f98; white-space: nowrap; }
  .reason { color: #9aa0aa; }
  .badge { color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 11px; }
  .meta { color: #8a8f98; font-size: 13px; margin-bottom: 14px; }
</style></head>
<body>
<header>
  <h1>FocusGate</h1>
  ${block
    ? `<span class="status on">● study block active · ends ${blockEndLabel()}</span>`
    : `<span class="status off">○ no active block (messages pass through)</span>`}
</header>
<main>
  <div class="meta">Student: <b>${esc(config.studentName)}</b> · relay number: <b>${esc(config.focusgateNumber || "(unset)")}</b> · held now: <b>${held.length}</b></div>
  <div class="controls">
    <input id="dur" type="number" value="120" min="1" style="width:80px"/> min
    <button class="primary" onclick="start()">Start block</button>
    <button class="stop" onclick="stop()">Stop &amp; send digest</button>
  </div>
  <table>
    <thead><tr><th>time</th><th>from</th><th>message</th><th>outcome</th><th>why</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" style="color:#777;padding:20px">No messages yet. Text the relay number to see triage decisions here.</td></tr>`}</tbody>
  </table>
</main>
<script>
  async function start() {
    const durationMinutes = Number(document.getElementById('dur').value) || 120;
    await fetch('/blocks/start', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ durationMinutes }) });
    location.reload();
  }
  async function stop() {
    const r = await fetch('/blocks/stop', { method: 'POST' });
    const j = await r.json();
    alert(j.digest || 'stopped');
    location.reload();
  }
</script>
</body></html>`);
});

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
