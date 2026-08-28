/**
 * Student routes - Ideal College
 * Workflow: admin registers student -> status 'pending' -> principal approves/rejects
 */
const express = require("express");
const { db, hash } = require("./db");
const { authMiddleware, requireRole } = require("./auth");

const router = express.Router();

function safe(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// GET /api/students - list all (admin + principal)
router.get("/", authMiddleware, requireRole("admin", "principal"), (req, res) => {
  const students = db.prepare("SELECT * FROM users WHERE role = 'student'").all().map(safe);
  res.json({ success: true, count: students.length, students });
});

// GET /api/students/pending - list accounts awaiting the principal's approval
router.get("/pending", authMiddleware, requireRole("principal"), (req, res) => {
  const pending = db.prepare("SELECT * FROM users WHERE role = 'student' AND status = 'pending'").all().map(safe);
  res.json({ success: true, count: pending.length, pending });
});

// GET /api/students/:id - view one (self, admin, or principal)
router.get("/:id", authMiddleware, (req, res) => {
  if (!["admin", "principal"].includes(req.user.role) && req.user.id !== req.params.id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });
  res.json({ success: true, student: safe(student) });
});

// POST /api/students - admin registers a new student -> goes to 'pending'
router.post("/", authMiddleware, requireRole("admin"), (req, res) => {
  const { id, fullName, class: className, gender, guardianName, guardianPhone, address, password } = req.body;
  if (!id || !fullName || !className || !password) {
    return res.status(400).json({ success: false, message: "id, fullName, class and password are required" });
  }

  const exists = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (exists) return res.status(409).json({ success: false, message: "A user with this ID already exists" });

  db.prepare(`
    INSERT INTO users (id, fullName, role, gender, phone, address, passwordHash, class, guardianName, guardianPhone, status, createdBy)
    VALUES (?, ?, 'student', ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, fullName, gender || null, guardianPhone || null, address || null, hash(password), className, guardianName || null, guardianPhone || null, req.user.id);

  const created = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.status(201).json({
    success: true,
    message: "Student registered. Awaiting principal's approval before the account can log in.",
    student: safe(created)
  });
});

// PATCH /api/students/:id/approve - principal approves
router.patch("/:id/approve", authMiddleware, requireRole("principal"), (req, res) => {
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });
  if (student.status !== "pending") {
    return res.status(400).json({ success: false, message: `Account is already ${student.status}` });
  }

  db.prepare("UPDATE users SET status = 'active', approvedBy = ?, decidedAt = datetime('now') WHERE id = ?")
    .run(req.user.id, req.params.id);

  res.json({ success: true, message: `${student.fullName} approved and can now log in` });
});

// PATCH /api/students/:id/reject - principal rejects
router.patch("/:id/reject", authMiddleware, requireRole("principal"), (req, res) => {
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });
  if (student.status !== "pending") {
    return res.status(400).json({ success: false, message: `Account is already ${student.status}` });
  }

  db.prepare("UPDATE users SET status = 'rejected', approvedBy = ?, decidedAt = datetime('now') WHERE id = ?")
    .run(req.user.id, req.params.id);

  res.json({ success: true, message: `${student.fullName}'s registration was rejected` });
});

// PUT /api/students/:id - update details (admin only)
router.put("/:id", authMiddleware, requireRole("admin"), (req, res) => {
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });

  const { fullName, class: className, gender, guardianName, guardianPhone, address } = req.body;
  db.prepare(`
    UPDATE users SET fullName = ?, class = ?, gender = ?, guardianName = ?, guardianPhone = ?, address = ?
    WHERE id = ?
  `).run(
    fullName ?? student.fullName, className ?? student.class, gender ?? student.gender,
    guardianName ?? student.guardianName, guardianPhone ?? student.guardianPhone,
    address ?? student.address, req.params.id
  );

  res.json({ success: true, message: "Student updated" });
});

// DELETE /api/students/:id - admin only
router.delete("/:id", authMiddleware, requireRole("admin"), (req, res) => {
  const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: "Student not found" });
  res.json({ success: true, message: "Student removed" });
});

module.exports = router;
