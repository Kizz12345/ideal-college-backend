/**
 * Staff routes - Ideal College (Phase 3: full form + role permissions)
 * Only leadership (proprietor/principal/vice_principal) can create staff —
 * created directly as 'active' since the creator IS the approving authority.
 */
const express = require("express");
const { db, hash, logActivity } = require("./db");
const { authMiddleware, requireRole, safeUser, LEADERSHIP_ROLES } = require("./auth");

const router = express.Router();
const STAFF_DESIGNATIONS = ["proprietor", "principal", "vice_principal", "class_teacher", "subject_teacher", "staff", "non_teaching_staff"];

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

// PUT /api/staff/:id - self-update (goes to pending confirmation) or leadership direct edit
router.put("/:id", authMiddleware, (req, res) => {
  const member = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!member || !STAFF_DESIGNATIONS.includes(member.role)) {
    return res.status(404).json({ success: false, message: "Staff member not found" });
  }

  const isSelf = req.user.id === req.params.id;
  const isLeadership = LEADERSHIP_ROLES.includes(req.user.role);
  if (!isSelf && !isLeadership) return res.status(403).json({ success: false, message: "Not authorized" });

  const b = req.body;
  const existing = member.profile ? JSON.parse(member.profile) : {};

  if (isSelf && !isLeadership) {
    // Self-service update — merged into profile but flagged pending until leadership confirms it.
    const merged = { ...existing, ...(b.profile || {}), pendingUpdate: true, updateRequestedBy: req.user.id };
    db.prepare("UPDATE users SET profile = ? WHERE id = ?").run(JSON.stringify(merged), req.params.id);
    logActivity(req.user.id, "staff_update_requested", { staffId: req.params.id });
    return res.json({ success: true, message: "Update submitted. It must be confirmed by the proprietor, principal or vice principal before it reflects." });
  }

  // Leadership direct edit
  const profile = {
    ...existing,
    employment: { ...existing.employment, teachingSubjects: b.teachingSubjects ?? existing.employment?.teachingSubjects }
  };
  db.prepare("UPDATE users SET firstName = ?, lastName = ?, phone = ?, profile = ? WHERE id = ?")
    .run(b.firstName ?? member.firstName, b.lastName ?? member.lastName, b.phone ?? member.phone, JSON.stringify(profile), req.params.id);

  logActivity(req.user.id, "staff_updated", { staffId: req.params.id });
  res.json({ success: true, message: "Staff record updated" });
});

// GET /api/staff/pending-updates
router.get("/pending-updates", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const staff = db.prepare(`SELECT * FROM users WHERE role IN (${STAFF_DESIGNATIONS.map(() => "?").join(",")})`)
    .all(...STAFF_DESIGNATIONS)
    .filter((s) => {
      try { return JSON.parse(s.profile || "{}").pendingUpdate; } catch { return false; }
    })
    .map(safeUser);
  res.json({ success: true, count: staff.length, staff });
});

// PATCH /api/staff/:id/confirm-update
router.patch("/:id/confirm-update", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const member = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!member) return res.status(404).json({ success: false, message: "Staff member not found" });

  const profile = member.profile ? JSON.parse(member.profile) : {};
  delete profile.pendingUpdate;
  delete profile.updateRequestedBy;
  db.prepare("UPDATE users SET profile = ? WHERE id = ?").run(JSON.stringify(profile), req.params.id);
  logActivity(req.user.id, "staff_update_confirmed", { staffId: req.params.id });
  res.json({ success: true, message: "Update confirmed and now reflected" });
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

// PATCH /api/staff/:id/role - leadership reassigns a staff member's designation
router.patch("/:id/role", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const member = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!member || !STAFF_DESIGNATIONS.includes(member.role)) {
    return res.status(404).json({ success: false, message: "Staff member not found" });
  }
  const { newRole } = req.body;
  if (!STAFF_DESIGNATIONS.includes(newRole)) {
    return res.status(400).json({ success: false, message: `newRole must be one of: ${STAFF_DESIGNATIONS.join(", ")}` });
  }

  const profile = member.profile ? JSON.parse(member.profile) : {};
  profile.employment = { ...profile.employment, designation: newRole };
  db.prepare("UPDATE users SET role = ?, profile = ? WHERE id = ?").run(newRole, JSON.stringify(profile), req.params.id);

  logActivity(req.user.id, "staff_role_changed", { staffId: req.params.id, from: member.role, to: newRole });
  res.json({ success: true, message: `${member.firstName} ${member.lastName} is now ${newRole.replace(/_/g, " ")}` });
});

module.exports = router;
