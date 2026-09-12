/**
 * Term settings routes - Ideal College
 * Proprietor/principal/vice principal set the current term, end-of-term
 * date, and resumption date. These reflect on every report sheet.
 */
const express = require("express");
const { db, logActivity } = require("./db");
const { authMiddleware, requireRole, LEADERSHIP_ROLES } = require("./auth");

const router = express.Router();

// GET /api/terms - anyone logged in can read (needed to display on report sheets)
router.get("/", authMiddleware, (req, res) => {
  const row = db.prepare("SELECT currentTerm, resumptionDate, vacationDate FROM terms WHERE id = 1").get();
  res.json({
    success: true,
    currentTerm: row?.currentTerm || null,
    endOfTerm: row?.vacationDate || null,
    resumptionDate: row?.resumptionDate || null
  });
});

// PATCH /api/terms - leadership only
router.patch("/", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const { currentTerm, endOfTerm, resumptionDate } = req.body;
  if (currentTerm && !["First Term", "Second Term", "Third Term"].includes(currentTerm)) {
    return res.status(400).json({ success: false, message: "currentTerm must be First Term, Second Term or Third Term" });
  }

  const existing = db.prepare("SELECT * FROM terms WHERE id = 1").get();
  db.prepare(`
    INSERT INTO terms (id, currentSession, currentTerm, resumptionDate, vacationDate)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET currentTerm = excluded.currentTerm, resumptionDate = excluded.resumptionDate, vacationDate = excluded.vacationDate
  `).run(
    existing?.currentSession || null,
    currentTerm ?? existing?.currentTerm,
    resumptionDate ?? existing?.resumptionDate,
    endOfTerm ?? existing?.vacationDate
  );

  logActivity(req.user.id, "term_settings_updated", { currentTerm, endOfTerm, resumptionDate });
  res.json({ success: true, message: "Term settings saved and will now reflect on report sheets" });
});

module.exports = router;
