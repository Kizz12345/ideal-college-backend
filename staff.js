/**
 * Staff routes - Ideal College (Phase 3: full form + role permissions)
 * Only leadership (proprietor/principal/vice_principal) can create staff —
 * created directly as 'active' since the creator IS the approving authority.
 */
const express = require("express");
const { db, hash, logActivity } = require("./db");
const { authMiddleware, requireRole, safeUser, LEADERSHIP_ROLES } = require("./auth");

const router = express.Router();
const STAFF_DESIGNATIONS = ["proprietor", "principal", "vice_principal", "class_teacher", "subject_teacher", "staff"];

function nextStaffId() {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role != 'student'").get();
  return `STF-${String(row.c + 1).padStart(4, "0")}`;
}

router.get("/", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const staff = db.prepare(`SELECT * FROM users WHERE role IN (${STAFF_DESIGNATIONS.map(() => "?").join(",")})`)
    .all(...STAFF_DESIGNATIONS).map(safeUser);
  res.json({ success: true, count: staff.length, staff });
});

router.get("/:id", authMiddleware, (req, res) => {
  if (!LEADERSHIP_ROLES.includes(req.user.role) && req.user.id !== req.params.id) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }
  const member = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!member || !STAFF_DESIGNATIONS.includes(member.role)) {
    return res.status(404).json({ success: false, message: "Staff member not found" });
  }
  res.json({ success: true, staff: safeUser(member) });
});

// POST /api/staff - full staff registration form, created active immediately
router.post("/", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const b = req.body;
  if (!b.firstName || !b.lastName || !b.email || !b.password || !b.designation) {
    return res.status(400).json({ success: false, message: "firstName, lastName, email, password and designation are required" });
  }
  if (!STAFF_DESIGNATIONS.includes(b.designation)) {
    return res.status(400).json({ success: false, message: `designation must be one of: ${STAFF_DESIGNATIONS.join(", ")}` });
  }

  const exists = db.prepare("SELECT id FROM users WHERE id = ? OR email = ?").get(b.email, b.email);
  if (exists) return res.status(409).json({ success: false, message: "A user with this email already exists" });

  const profile = {
    personal: {
      gender: b.gender || null, dob: b.dob || null, maritalStatus: b.maritalStatus || null,
      nationality: b.nationality || null, stateOfOrigin: b.stateOfOrigin || null, lga: b.lga || null,
      homeAddress: b.homeAddress || null, permanentAddress: b.permanentAddress || null
    },
    employment: {
      staffId: nextStaffId(),
      isClassTeacher: !!b.isClassTeacher,
      isSubjectTeacher: !!b.isSubjectTeacher,
      teachingSubjects: b.teachingSubjects || null,
      designation: b.designation,
      dateOfEmployment: b.dateOfEmployment || null,
      employmentType: b.employmentType || null
    },
    education: { highestQualification: b.highestQualification || null },
    other: { idCardNin: b.idCardNin || null }
  };

  db.prepare(`
    INSERT INTO users (id, role, firstName, middleName, lastName, email, phone, passportPhoto, passwordHash, status, profile, createdBy, approvedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    b.email, b.designation, b.firstName, b.middleName || null, b.lastName, b.email, b.phone || null,
    b.passportPhoto || null, hash(b.password), JSON.stringify(profile), req.user.id, req.user.id
  );

  logActivity(req.user.id, "staff_created", { email: b.email, designation: b.designation });
  res.status(201).json({ success: true, message: `Staff account created (${profile.employment.staffId})` });
});

router.put("/:id", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const member = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!member || !STAFF_DESIGNATIONS.includes(member.role)) {
    return res.status(404).json({ success: false, message: "Staff member not found" });
  }
  const b = req.body;
  const existing = member.profile ? JSON.parse(member.profile) : {};
  const profile = {
    ...existing,
    employment: { ...existing.employment, teachingSubjects: b.teachingSubjects ?? existing.employment?.teachingSubjects }
  };

  db.prepare("UPDATE users SET firstName = ?, lastName = ?, phone = ?, profile = ? WHERE id = ?")
    .run(b.firstName ?? member.firstName, b.lastName ?? member.lastName, b.phone ?? member.phone, JSON.stringify(profile), req.params.id);

  logActivity(req.user.id, "staff_updated", { staffId: req.params.id });
  res.json({ success: true, message: "Staff record updated" });
});

router.delete("/:id", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const member = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!member || !STAFF_DESIGNATIONS.includes(member.role)) {
    return res.status(404).json({ success: false, message: "Staff member not found" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  logActivity(req.user.id, "staff_deleted", { staffId: req.params.id });
  res.json({ success: true, message: "Staff account removed" });
});

module.exports = router;
