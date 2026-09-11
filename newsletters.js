/**
 * Newsletter routes - Ideal College
 * Staff upload a PDF/Word file (base64) as a newsletter; students and staff
 * can view/download the list any time after upload — no approval gate,
 * per spec (approval is only required for gallery images).
 */
const express = require("express");
const { db, logActivity } = require("./db");
const { authMiddleware, requireRole, LEADERSHIP_ROLES } = require("./auth");

const router = express.Router();
const CAN_UPLOAD = [...LEADERSHIP_ROLES, "class_teacher", "subject_teacher", "staff"];

// GET /api/newsletters - anyone logged in can view/download
router.get("/", authMiddleware, (req, res) => {
  const newsletters = db.prepare("SELECT id, title, uploadedBy, createdAt FROM newsletters ORDER BY createdAt DESC").all();
  res.json({ success: true, newsletters });
});

// GET /api/newsletters/:id/file - the actual file (base64 data URI)
router.get("/:id/file", authMiddleware, (req, res) => {
  const row = db.prepare("SELECT * FROM newsletters WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: "Not found" });
  res.json({ success: true, title: row.title, filePath: row.filePath });
});

// POST /api/newsletters
router.post("/", authMiddleware, requireRole(...CAN_UPLOAD), (req, res) => {
  const { title, fileData } = req.body;
  if (!title || !fileData) return res.status(400).json({ success: false, message: "title and fileData (base64) are required" });

  const result = db.prepare("INSERT INTO newsletters (title, filePath, uploadedBy) VALUES (?, ?, ?)").run(title, fileData, req.user.id);
  logActivity(req.user.id, "newsletter_uploaded", { id: result.lastInsertRowid, title });
  res.status(201).json({ success: true, message: "Newsletter uploaded" });
});

router.delete("/:id", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const result = db.prepare("DELETE FROM newsletters WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: "Not found" });
  logActivity(req.user.id, "newsletter_deleted", { id: req.params.id });
  res.json({ success: true, message: "Newsletter removed" });
});

module.exports = router;
