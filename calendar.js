/**
 * Academic Calendar routes - Ideal College
 * A single current calendar document (PDF or Word). Only proprietor,
 * principal or vice principal can upload or delete it; everyone else
 * (students, subject teachers, class teachers, other staff) can only view it.
 *
 * Also serves the "Class Teachers" and "Staff" directory listings that
 * live under the same tab.
 */
const express = require("express");
const { db, logActivity } = require("./db");
const { authMiddleware, requireRole, LEADERSHIP_ROLES } = require("./auth");

const router = express.Router();

// GET /api/calendar - anyone logged in can view the current calendar
router.get("/", authMiddleware, (req, res) => {
  const row = db.prepare("SELECT * FROM academic_calendar WHERE id = 1").get();
  if (!row || !row.fileData) return res.json({ success: true, exists: false });
  res.json({ success: true, exists: true, fileName: row.fileName, fileData: row.fileData, uploadedAt: row.uploadedAt });
});

// POST /api/calendar - leadership uploads/replaces the calendar
router.post("/", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const { fileName, fileData } = req.body;
  if (!fileName || !fileData) return res.status(400).json({ success: false, message: "fileName and fileData (base64) are required" });

  db.prepare(`
    INSERT INTO academic_calendar (id, fileName, fileData, uploadedBy, uploadedAt)
    VALUES (1, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET fileName = excluded.fileName, fileData = excluded.fileData, uploadedBy = excluded.uploadedBy, uploadedAt = excluded.uploadedAt
  `).run(fileName, fileData, req.user.id);

  logActivity(req.user.id, "calendar_uploaded", { fileName });
  res.status(201).json({ success: true, message: "Academic calendar uploaded" });
});

// DELETE /api/calendar - leadership removes it
router.delete("/", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  db.prepare("DELETE FROM academic_calendar WHERE id = 1").run();
  logActivity(req.user.id, "calendar_deleted");
  res.json({ success: true, message: "Academic calendar removed" });
});

// GET /api/calendar/directory/class-teachers
router.get("/directory/class-teachers", authMiddleware, (req, res) => {
  const teachers = db.prepare("SELECT id, firstName, lastName, email FROM users WHERE role = 'class_teacher'").all();
  res.json({ success: true, teachers });
});

// GET /api/calendar/directory/staff - every registered admin/staff account
router.get("/directory/staff", authMiddleware, (req, res) => {
  const staff = db.prepare("SELECT id, firstName, lastName, email, role FROM users WHERE role NOT IN ('student','developer')").all();
  res.json({ success: true, staff });
});

module.exports = router;
