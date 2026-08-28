/**
 * Results / Report Card routes - Ideal College (SQLite-backed)
 * Uses WAEC-style grading: A1,B2,B3,C4,C5,C6,D7,E8,F9
 */
const express = require("express");
const { db } = require("./db");
const { authMiddleware, requireRole } = require("./auth");

const router = express.Router();

function gradeFor(total) {
  if (total >= 75) return "A1";
  if (total >= 70) return "B2";
  if (total >= 65) return "B3";
  if (total >= 60) return "C4";
  if (total >= 55) return "C5";
  if (total >= 50) return "C6";
  if (total >= 45) return "D7";
  if (total >= 40) return "E8";
  return "F9";
}

function rowToResult(row) {
  return { ...row, subjects: JSON.parse(row.subjects) };
}

// GET /api/results/:studentId - all terms for a student (self, admin, principal, staff)
router.get("/:studentId", authMiddleware, (req, res) => {
  if (!["admin", "principal", "staff"].includes(req.user.role) && req.user.id !== req.params.studentId) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }
  const rows = db.prepare("SELECT * FROM results WHERE studentId = ?").all(req.params.studentId);
  if (rows.length === 0) return res.status(404).json({ success: false, message: "No results found" });
  res.json({ success: true, results: rows.map(rowToResult) });
});

// GET /api/results/:studentId/:term
router.get("/:studentId/:term", authMiddleware, (req, res) => {
  if (!["admin", "principal", "staff"].includes(req.user.role) && req.user.id !== req.params.studentId) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }
  const row = db.prepare("SELECT * FROM results WHERE studentId = ? AND term = ?")
    .get(req.params.studentId, req.params.term);
  if (!row) return res.status(404).json({ success: false, message: "Result not found" });
  res.json({ success: true, result: rowToResult(row) });
});

// POST /api/results - staff/admin uploads a result (auto-grades)
router.post("/", authMiddleware, requireRole("staff", "admin"), (req, res) => {
  const { studentId, session, term, subjects, position, teacherRemark, principalRemark } = req.body;
  if (!studentId || !session || !term || !Array.isArray(subjects)) {
    return res.status(400).json({ success: false, message: "studentId, session, term and subjects[] are required" });
  }

  const gradedSubjects = subjects.map((s) => {
    const total = Number(s.ca || 0) + Number(s.exam || 0);
    return { name: s.name, ca: s.ca, exam: s.exam, total, grade: gradeFor(total) };
  });

  db.prepare(`
    INSERT INTO results (studentId, session, term, subjects, position, teacherRemark, principalRemark)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(studentId, session, term) DO UPDATE SET
      subjects = excluded.subjects, position = excluded.position,
      teacherRemark = excluded.teacherRemark, principalRemark = excluded.principalRemark
  `).run(studentId, session, term, JSON.stringify(gradedSubjects), position || "-", teacherRemark || "", principalRemark || "");

  const saved = db.prepare("SELECT * FROM results WHERE studentId = ? AND session = ? AND term = ?")
    .get(studentId, session, term);
  res.status(201).json({ success: true, message: "Result saved", result: rowToResult(saved) });
});

// DELETE /api/results/:studentId/:term - admin only
router.delete("/:studentId/:term", authMiddleware, requireRole("admin"), (req, res) => {
  const result = db.prepare("DELETE FROM results WHERE studentId = ? AND term = ?")
    .run(req.params.studentId, req.params.term);
  if (result.changes === 0) return res.status(404).json({ success: false, message: "Result not found" });
  res.json({ success: true, message: "Result deleted" });
});

module.exports = router;
