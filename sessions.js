/**
 * Academic session routes - Ideal College
 * Only leadership can create a new session. Score upload/download and the
 * report sheet all check hasActiveSession() first — if there's no current
 * session, they're blocked with a notice to contact the principal's office.
 */
const express = require("express");
const { db, logActivity } = require("./db");
const { authMiddleware, requireRole, LEADERSHIP_ROLES } = require("./auth");

const router = express.Router();

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  session TEXT PRIMARY KEY,          -- e.g. '2026/2027'
  isCurrent INTEGER NOT NULL DEFAULT 0,
  createdBy TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);
`);

// Seed the current session once, matching your original terms.json default
const seeded = db.prepare("SELECT COUNT(*) AS c FROM sessions").get().c;
if (seeded === 0) {
  db.prepare("INSERT INTO sessions (session, isCurrent, createdBy) VALUES (?, 1, 'system')").run("2026/2027");
}

function hasActiveSession() {
  return !!db.prepare("SELECT session FROM sessions WHERE isCurrent = 1").get();
}
function currentSession() {
  return db.prepare("SELECT session FROM sessions WHERE isCurrent = 1").get()?.session || null;
}

// GET /api/sessions - public list (for the "view previous session" dropdown)
router.get("/", (req, res) => {
  const sessions = db.prepare("SELECT * FROM sessions ORDER BY session DESC").all();
  res.json({ success: true, sessions, current: currentSession() });
});

// POST /api/sessions - leadership creates a new session and makes it current
router.post("/", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const { session } = req.body;
  if (!session || !/^\d{4}\/\d{4}$/.test(session)) {
    return res.status(400).json({ success: false, message: "Provide a session like 2027/2028" });
  }
  const exists = db.prepare("SELECT session FROM sessions WHERE session = ?").get(session);
  if (exists) return res.status(409).json({ success: false, message: "That session already exists" });

  db.prepare("UPDATE sessions SET isCurrent = 0").run();
  db.prepare("INSERT INTO sessions (session, isCurrent, createdBy) VALUES (?, 1, ?)").run(session, req.user.id);

  logActivity(req.user.id, "session_created", { session });
  res.status(201).json({ success: true, message: `${session} is now the current session. Score upload and download are now open.` });
});

module.exports = router;
module.exports.hasActiveSession = hasActiveSession;
module.exports.currentSession = currentSession;
