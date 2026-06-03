import express from "express";
import { config, reportConfigHealth } from "./config.js";
import { smsRouter } from "./routes/sms.js";
import { blocksRouter } from "./routes/blocks.js";
import { studentsRouter } from "./routes/students.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { upsertStudentByNumber } from "./store.js";

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/sms", smsRouter);
app.use("/blocks", blocksRouter);
app.use("/students", studentsRouter);
app.use("/", dashboardRouter);

// Convenience: seed a single student from env so a fresh clone is one .env away
// from a working concierge test. Multi-student setups use POST /students.
if (config.studentPhone && config.focusgateNumber) {
  const s = upsertStudentByNumber({
    name: config.studentName,
    phone: config.studentPhone,
    focusgateNumber: config.focusgateNumber,
  });
  console.log(`[seed] student ready: ${s.name} (${s.focusgateNumber} → ${s.phone})`);
}

app.listen(config.port, () => {
  console.log(`FocusGate relay listening on http://localhost:${config.port}`);
  console.log(`  operator dashboard: http://localhost:${config.port}/`);
  console.log(`  twilio webhook:     POST /sms/inbound`);
  reportConfigHealth();
});
