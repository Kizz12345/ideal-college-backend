/**
 * Homepage hero slider - Ideal College
 * Up to 3 images, shown as a sliding carousel on the public homepage.
 * Public (no login) can view; only proprietor/principal/vice principal
 * can upload, replace, or delete a slide.
 */
const express = require("express");
const { db, logActivity } = require("./db");
const { authMiddleware, requireRole, LEADERSHIP_ROLES } = require("./auth");

const router = express.Router();

// GET /api/hero - public, no auth: only the slots that actually have an image
router.get("/", (req, res) => {
  const slides = db.prepare("SELECT slot, imageData FROM hero_slides WHERE imageData IS NOT NULL ORDER BY slot").all();
  res.json({ success: true, slides });
});

// POST /api/hero/:slot - leadership uploads/replaces a slide (slot must be 1, 2, or 3)
router.post("/:slot", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const slot = Number(req.params.slot);
  if (![1, 2, 3].includes(slot)) return res.status(400).json({ success: false, message: "slot must be 1, 2 or 3" });
  const { imageData } = req.body;
  if (!imageData) return res.status(400).json({ success: false, message: "imageData (base64) is required" });

  db.prepare(`
    INSERT INTO hero_slides (slot, imageData, uploadedBy, uploadedAt)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(slot) DO UPDATE SET imageData = excluded.imageData, uploadedBy = excluded.uploadedBy, uploadedAt = excluded.uploadedAt
  `).run(slot, imageData, req.user.id);

  logActivity(req.user.id, "hero_slide_uploaded", { slot });
  res.status(201).json({ success: true, message: `Slide ${slot} uploaded` });
});

// DELETE /api/hero/:slot
router.delete("/:slot", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const slot = Number(req.params.slot);
  if (![1, 2, 3].includes(slot)) return res.status(400).json({ success: false, message: "slot must be 1, 2 or 3" });

  db.prepare("DELETE FROM hero_slides WHERE slot = ?").run(slot);
  logActivity(req.user.id, "hero_slide_deleted", { slot });
  res.json({ success: true, message: `Slide ${slot} removed` });
});

module.exports = router;
