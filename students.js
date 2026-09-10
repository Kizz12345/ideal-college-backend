/**
 * Student routes - Ideal College (Phase 2: full registration + approval)
 *
 * Any staff role can submit a registration (status 'pending'). Only
 * proprietor/principal/vice_principal can approve or decline it. The
 * student's login username + password are only generated/usable once
 * approved.
 */
const express = require("express");
const { db, hash, logActivity } = require("./db");
const { authMiddleware, requireRole, generateStudentUsername, safeUser, LEADERSHIP_ROLES } = require("./auth");

const router = express.Router();
const STAFF_ALL = [...LEADERSHIP_ROLES, "class_teacher", "subject_teacher", "staff"];

// GET /api/students
router.get("/", authMiddleware, requireRole(...STAFF_ALL), (req, res) => {
  const students = db.prepare("SELECT * FROM users WHERE role = 'student'").all().map(safeUser);
  res.json({ success: true, count: students.length, students });
});

// GET /api/students/pending
router.get("/pending", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const pending = db.prepare("SELECT * FROM users WHERE role = 'student' AND status = 'pending'").all().map(safeUser);
  res.json({ success: true, count: pending.length, pending });
});

// GET /api/students/pending-updates - profile edits awaiting confirmation
router.get("/pending-updates", authMiddleware, requireRole(...LEADERSHIP_ROLES, "class_teacher"), (req, res) => {
  const students = db.prepare("SELECT * FROM users WHERE role = 'student'").all()
    .filter((s) => {
      try { return JSON.parse(s.profile || "{}").pendingUpdate; } catch { return false; }
    })
    .map(safeUser);
  res.json({ success: true, count: students.length, students });
});

// GET /api/students/:id
router.get("/:id", authMiddleware, (req, res) => {
  if (!STAFF_ALL.includes(req.user.role) && req.user.id !== req.params.id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });
  res.json({ success: true, student: safeUser(student) });
});

// POST /api/students - full registration form -> 'pending' until leadership approves
router.post("/", authMiddleware, requireRole(...STAFF_ALL), (req, res) => {
  const b = req.body;

  // Required minimum fields to identify + generate the username
  if (!b.admissionYear || !b.admissionNumber || !b.firstName || !b.lastName || !b.classGrade) {
    return res.status(400).json({ success: false, message: "admissionYear, admissionNumber, firstName, lastName and classGrade are required" });
  }

  const username = generateStudentUsername(b.admissionYear, b.admissionNumber);
  const exists = db.prepare("SELECT id FROM users WHERE id = ?").get(username);
  if (exists) return res.status(409).json({ success: false, message: `A student with ID ${username} already exists` });

  const surnamePassword = b.lastName.trim().toLowerCase();

  const profile = {
    admission: {
      admissionDate: b.admissionDate || null,
      admissionYear: b.admissionYear,
      admissionNumber: b.admissionNumber,
      nin: b.nin || null,
      contactNo: b.contactNo || null,
      whatsappNo: b.whatsappNo || null
    },
    personal: {
      gender: b.gender || null,
      dob: b.dob || null,
      placeOfBirth: b.placeOfBirth || null,
      nationality: b.nationality || null,
      religion: b.religion || null,
      bloodGroup: b.bloodGroup || null,
      homeAddress: b.homeAddress || null
    },
    academic: {
      classGrade: b.classGrade,
      section: b.section || null
    },
    guardian: {
      father: {
        name: b.fatherName || null, address: b.fatherAddress || null,
        contact: b.fatherContact || null, occupation: b.fatherOccupation || null
      },
      mother: {
        name: b.motherName || null, address: b.motherAddress || null,
        contact: b.motherContact || null, occupation: b.motherOccupation || null
      }
    },
    documents: {
      recommendationLetter: b.recommendationLetter || null // base64 data URI, optional
    },
    declaration: !!b.declaration
  };

  if (!profile.declaration) {
    return res.status(400).json({ success: false, message: "The declaration must be accepted to register a student" });
  }

  db.prepare(`
    INSERT INTO users (id, role, firstName, middleName, lastName, email, phone, passportPhoto, passwordHash, status, profile, createdBy)
    VALUES (?, 'student', ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    username, b.firstName, b.middleName || null, b.lastName, b.email || null, b.contactNo || null,
    b.passportPhoto || null, hash(surnamePassword), JSON.stringify(profile), req.user.id
  );

  logActivity(req.user.id, "student_registered", { username, classGrade: b.classGrade });

  res.status(201).json({
    success: true,
    message: `Registration submitted. Student ID: ${username} (initial password: surname, lowercase). Awaiting approval by the proprietor, principal or vice principal.`,
    studentId: username
  });
});

// PATCH /api/students/:id/approve
router.patch("/:id/approve", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });
  if (student.status !== "pending") return res.status(400).json({ success: false, message: `Already ${student.status}` });

  db.prepare("UPDATE users SET status = 'active', approvedBy = ?, decidedAt = datetime('now') WHERE id = ?").run(req.user.id, req.params.id);
  logActivity(req.user.id, "student_approved", { studentId: req.params.id });
  res.json({ success: true, message: `${student.firstName} ${student.lastName} approved. They can now log in.` });
});

// PATCH /api/students/:id/reject
router.patch("/:id/reject", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });
  if (student.status !== "pending") return res.status(400).json({ success: false, message: `Already ${student.status}` });

  db.prepare("UPDATE users SET status = 'rejected', approvedBy = ?, decidedAt = datetime('now') WHERE id = ?").run(req.user.id, req.params.id);
  logActivity(req.user.id, "student_rejected", { studentId: req.params.id });
  res.json({ success: true, message: "Registration declined" });
});

// PUT /api/students/:id - profile update, must be re-confirmed (goes back to pending review flag)
router.put("/:id", authMiddleware, (req, res) => {
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });

  const isSelf = req.user.id === req.params.id;
  const isStaff = STAFF_ALL.includes(req.user.role);
  if (!isSelf && !isStaff) return res.status(403).json({ success: false, message: "Not authorized" });

  const existingProfile = student.profile ? JSON.parse(student.profile) : {};
  const updatedProfile = { ...existingProfile, ...(req.body.profile || {}), pendingUpdate: true, updateRequestedBy: req.user.id };

  db.prepare("UPDATE users SET profile = ? WHERE id = ?").run(JSON.stringify(updatedProfile), req.params.id);
  logActivity(req.user.id, "student_update_requested", { studentId: req.params.id });
  res.json({ success: true, message: "Update submitted. It must be confirmed by the class teacher, principal or proprietor before it reflects." });
});

// PATCH /api/students/:id/confirm-update - class teacher/leadership confirms a pending profile edit
router.patch("/:id/confirm-update", authMiddleware, requireRole(...LEADERSHIP_ROLES, "class_teacher"), (req, res) => {
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });

  const profile = student.profile ? JSON.parse(student.profile) : {};
  delete profile.pendingUpdate;
  delete profile.updateRequestedBy;
  db.prepare("UPDATE users SET profile = ? WHERE id = ?").run(JSON.stringify(profile), req.params.id);
  logActivity(req.user.id, "student_update_confirmed", { studentId: req.params.id });
  res.json({ success: true, message: "Update confirmed and now reflected" });
});

// DELETE /api/students/:id
router.delete("/:id", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: "Student not found" });
  logActivity(req.user.id, "student_deleted", { studentId: req.params.id });
  res.json({ success: true, message: "Student removed" });
});

module.exports = router;
