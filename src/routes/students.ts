import { Router } from "express";
import { createStudent, listStudents, getStudentByFocusgateNumber, setPushToken, getStudentById } from "../store.js";

export const studentsRouter = Router();

/** List students. GET /students */
studentsRouter.get("/", (_req, res) => {
  res.json({ students: listStudents() });
});

/** Register a student. POST /students { name, phone, focusgateNumber } */
studentsRouter.post("/", (req, res) => {
  const { name, phone, focusgateNumber } = req.body ?? {};
  if (!name || !phone || !focusgateNumber) {
    res.status(400).json({ error: "name, phone, focusgateNumber are required" });
    return;
  }
  if (getStudentByFocusgateNumber(focusgateNumber)) {
    res.status(409).json({ error: "that FocusGate number is already registered" });
    return;
  }
  res.json({ ok: true, student: createStudent({ name, phone, focusgateNumber }) });
});

/** Register the student's Expo push token (used by the native client, PR #3). POST /students/:id/push-token { token } */
studentsRouter.post("/:id/push-token", (req, res) => {
  const student = getStudentById(Number(req.params.id));
  if (!student) {
    res.status(404).json({ error: "unknown student" });
    return;
  }
  const token = String(req.body?.token ?? "");
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }
  setPushToken(student.id, token);
  res.json({ ok: true });
});
