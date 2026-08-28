/**
 * Staff routes - Ideal College
 * Admin creates staff accounts directly (active immediately - no approval step,
 * since staff are hired/vetted before the account is created).
 */
const express = require("express");
const { db, hash } = require("./db");
const { authMiddleware, requireRole } = require("./auth");

const router = express.Router();

function safe(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// GET /api/staff - list all staff (admin + principal)
router.get("/", authMiddleware, requireRole("admin", "principal"), (req, res) => {
  const staff = db.prepare("SELECT * FROM users WHERE role = 'staff'").all().map(safe);
  res.json({ success: true, count: staff.length, staff });
});

// GET /api/staff/:id
router.get("/:id", authMiddleware, (req, res) => {
  if (!["admin", "principal"].includes(req.user.role) && req.user.id !== req.params.id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }
  const member = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(req.params.id);
  if (!member) return res.status(404).json({ success: false, message: "Staff member not found" });
  res.json({ success: true, staff: safe(member) });
});

// POST /api/staff - admin registers a new staff member (active immediately)
router.post("/", authMiddleware, requireRole("admin"), (req, res) => {
  const { id, fullName, gender, phone, address, password, department, subjectsTaught } = req.body;
  if (!id || !fullName || !password || !department) {
    return res.status(400).json({ success: false, message: "id, fullName, password and department are required" });
  }

  const exists = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (exists) return res.status(409).json({ success: false, message: "A user with this ID already exists" });

  db.prepare(`
    INSERT INTO users (id, fullName, role, gender, phone, address, passwordHash, department, subjectsTaught, status, createdBy, approvedBy)
    VALUES (?, ?, 'staff', ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(id, fullName, gender || null, phone || null, address || null, hash(password), department, subjectsTaught || null, req.user.id, req.user.id);

  const created = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.status(201).json({ success: true, message: "Staff account created", staff: safe(created) });
});

// PUT /api/staff/:id - update (admin only)
router.put("/:id", authMiddleware, requireRole("admin"), (req, res) => {
  const member = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(req.params.id);
  if (!member) return res.status(404).json({ success: false, message: "Staff member not found" });

  const { fullName, gender, phone, address, department, subjectsTaught } = req.body;
  db.prepare(`
    UPDATE users SET fullName = ?, gender = ?, phone = ?, address = ?, department = ?, subjectsTaught = ?
    WHERE id = ?
  `).run(
    fullName ?? member.fullName, gender ?? member.gender, phone ?? member.phone,
    address ?? member.address, department ?? member.department,
    subjectsTaught ?? member.subjectsTaught, req.params.id
  );

  res.json({ success: true, message: "Staff record updated" });
});

// DELETE /api/staff/:id - admin only
router.delete("/:id", authMiddleware, requireRole("admin"), (req, res) => {
  const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'staff'").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: "Staff member not found" });
  res.json({ success: true, message: "Staff account removed" });
});

module.exports = router;
