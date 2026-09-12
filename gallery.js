/**
 * Gallery routes - Ideal College
 * Staff upload images (base64) -> pending. Only leadership can approve
 * before they appear publicly. Students/public can only view approved ones.
 */
const express = require("express");
const { db, logActivity } = require("./db");
const { authMiddleware, requireRole, LEADERSHIP_ROLES } = require("./auth");

const router = express.Router();
const CAN_UPLOAD = [...LEADERSHIP_ROLES, "class_teacher", "subject_teacher", "staff"];

// GET /api/gallery - public: approved images only
router.get("/", (req, res) => {
  const images = db.prepare("SELECT id, imagePath, caption, createdAt FROM gallery WHERE status = 'approved' ORDER BY createdAt DESC").all();
  res.json({ success: true, images });
});

// GET /api/gallery/pending - leadership: approval queue
router.get("/pending", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const images = db.prepare("SELECT * FROM gallery WHERE status = 'pending' ORDER BY createdAt DESC").all();
  res.json({ success: true, images });
});

// POST /api/gallery - staff uploads (base64 image), goes to pending
router.post("/", authMiddleware, requireRole(...CAN_UPLOAD), (req, res) => {
  const { imageData, caption } = req.body;
  if (!imageData) return res.status(400).json({ success: false, message: "imageData (base64) is required" });

  const result = db.prepare("INSERT INTO gallery (imagePath, caption, uploadedBy, status) VALUES (?, ?, ?, 'pending')")
    .run(imageData, caption || "", req.user.id);

  logActivity(req.user.id, "gallery_uploaded", { id: result.lastInsertRowid });
  res.status(201).json({ success: true, message: "Image submitted. It will appear once approved by the proprietor, principal or vice principal." });
});

// PATCH /api/gallery/:id/approve
router.patch("/:id/approve", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const result = db.prepare("UPDATE gallery SET status = 'approved', approvedBy = ? WHERE id = ? AND status = 'pending'").run(req.user.id, req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: "Not found or already decided" });
  logActivity(req.user.id, "gallery_approved", { id: req.params.id });
  res.json({ success: true, message: "Image approved and now public" });
});

// PATCH /api/gallery/:id/reject
router.patch("/:id/reject", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const result = db.prepare("UPDATE gallery SET status = 'rejected', approvedBy = ? WHERE id = ? AND status = 'pending'").run(req.user.id, req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: "Not found or already decided" });
  logActivity(req.user.id, "gallery_rejected", { id: req.params.id });
  res.json({ success: true, message: "Image declined" });
});

router.delete("/:id", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const result = db.prepare("DELETE FROM gallery WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: "Not found" });
  logActivity(req.user.id, "gallery_deleted", { id: req.params.id });
  res.json({ success: true, message: "Image removed" });
});

module.exports = router;
