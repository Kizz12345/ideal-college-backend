/**
 * Activity log routes - Ideal College (Information tab)
 * Leadership-only. Split by student vs admin/staff, per spec.
 */
const express = require("express");
const { db } = require("./db");
const { authMiddleware, requireRole, LEADERSHIP_ROLES } = require("./auth");

const router = express.Router();

// GET /api/activity/mine - the logged-in user's own recent uploads/actions
router.get("/mine", authMiddleware, (req, res) => {
  const activity = db.prepare("SELECT * FROM activity_log WHERE userId = ? ORDER BY createdAt DESC LIMIT 50").all(req.user.id);
  res.json({ success: true, activity });
});

// GET /api/activity/students
router.get("/students", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const studentIds = db.prepare("SELECT id FROM users WHERE role = 'student'").all().map((r) => r.id);
  if (studentIds.length === 0) return res.json({ success: true, activity: [] });

  const placeholders = studentIds.map(() => "?").join(",");
  const activity = db.prepare(`SELECT * FROM activity_log WHERE userId IN (${placeholders}) ORDER BY createdAt DESC LIMIT 200`).all(...studentIds);
  res.json({ success: true, activity });
});

// GET /api/activity/admins
router.get("/admins", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const staffIds = db.prepare("SELECT id FROM users WHERE role NOT IN ('student','developer')").all().map((r) => r.id);
  if (staffIds.length === 0) return res.json({ success: true, activity: [] });

  const placeholders = staffIds.map(() => "?").join(",");
  const activity = db.prepare(`SELECT * FROM activity_log WHERE userId IN (${placeholders}) ORDER BY createdAt DESC LIMIT 200`).all(...staffIds);
  res.json({ success: true, activity });
});

module.exports = router;
