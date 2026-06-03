import { Router } from "express";
import { listStudents, getActiveBlock, recentMessages, heldMessages, blockEndLabel } from "../store.js";

export const dashboardRouter = Router();

/**
 * Operator dashboard for the concierge test. One section per student: their block
 * status, start/stop controls, and a live log of each message + what the AI decided.
 */
dashboardRouter.get("/", (_req, res) => {
  const students = listStudents();

  const outcomeBadge: Record<string, string> = {
    "pushed-urgent": "#d33",
    held: "#888",
    "passed-through": "#369",
  };

  const sections = students
    .map((s) => {
      const block = getActiveBlock(s.id);
      const msgs = recentMessages(s.id, 30);
      const held = heldMessages(s.id);
      const rows =
        msgs
          .map((m) => {
            const color = outcomeBadge[m.outcome] ?? "#444";
            const reason = m.triage ? `${m.triage.reason} (${m.triage.source})` : "—";
            const time = new Date(m.receivedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
            return `<tr><td class="t">${time}</td><td>${esc(m.from)}</td><td>${esc(m.body)}</td><td><span class="badge" style="background:${color}">${m.outcome}</span></td><td class="reason">${esc(reason)}</td></tr>`;
          })
          .join("") ||
        `<tr><td colspan="5" style="color:#777;padding:16px">No messages yet.</td></tr>`;

      return `<section class="card">
        <div class="head">
          <div>
            <div class="name">${esc(s.name)}</div>
            <div class="meta">relay ${esc(s.focusgateNumber)} → ${esc(s.phone)} · held: ${held.length}</div>
          </div>
          ${block ? `<span class="status on">● active · ends ${blockEndLabel(s.id)}</span>` : `<span class="status off">○ no block</span>`}
        </div>
        <div class="controls">
          <input type="number" id="dur-${s.id}" value="120" min="1"/> min
          <button class="primary" onclick="start(${s.id})">Start</button>
          <button class="stop" onclick="stop(${s.id})">Stop &amp; digest</button>
        </div>
        <table><thead><tr><th>time</th><th>from</th><th>message</th><th>outcome</th><th>why</th></tr></thead><tbody>${rows}</tbody></table>
      </section>`;
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
  header { padding: 16px 20px; border-bottom: 1px solid #222; }
  h1 { font-size: 16px; margin: 0; letter-spacing: .02em; }
  main { padding: 20px; display: grid; gap: 18px; max-width: 1100px; }
  .card { border: 1px solid #1d1f25; border-radius: 12px; padding: 16px; background: #14161b; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
  .name { font-size: 15px; font-weight: 600; }
  .meta { color: #8a8f98; font-size: 12px; margin-top: 2px; }
  .status { font-size: 13px; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
  .on { background: #14361f; color: #6ee79b; }
  .off { background: #2a2a2a; color: #aaa; }
  .controls { margin-bottom: 12px; display: flex; gap: 8px; align-items: center; }
  button, input { font-size: 13px; padding: 7px 11px; border-radius: 8px; border: 1px solid #333; background: #1b1e24; color: #e6e6e6; }
  button { cursor: pointer; } input { width: 64px; }
  button.primary { background: #2563eb; border-color: #2563eb; }
  button.stop { background: #3a1414; border-color: #5a1d1d; color: #ffb4b4; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #1d1f25; vertical-align: top; }
  th { color: #8a8f98; font-weight: 600; }
  .t { color: #8a8f98; white-space: nowrap; } .reason { color: #9aa0aa; }
  .badge { color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 11px; }
  .empty { color: #777; padding: 24px; }
</style></head>
<body>
<header><h1>FocusGate — operator</h1></header>
<main>${sections || `<div class="empty">No students registered. POST /students { name, phone, focusgateNumber } or set STUDENT_* env to seed one.</div>`}</main>
<script>
  async function start(id) {
    const durationMinutes = Number(document.getElementById('dur-'+id).value) || 120;
    await fetch('/blocks/'+id+'/start', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ durationMinutes }) });
    location.reload();
  }
  async function stop(id) {
    const r = await fetch('/blocks/'+id+'/stop', { method: 'POST' });
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
