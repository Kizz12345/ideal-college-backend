/**
 * Results routes - Ideal College
 *
 * 1st C.A. = Classwork(5) + Assignment(5) + Practical(5) + Quiz(5)   = 20
 * 2nd C.A. = Test(10) + Project(10)                                  = 20
 * Exam                                                                = 60
 * TOTAL    = 1st C.A. + 2nd C.A. + Exam                              = 100
 *
 * Class lowest/highest/average are computed only among students who
 * OFFER that subject (not the whole class) — matches the school's rule.
 * Position / year average / years-position columns are intentionally
 * left blank, per instruction.
 *
 * Signature = initials of whichever teacher uploaded that subject's score
 * (captured automatically from their name at upload time).
 *
 * Uploading and downloading are both blocked with a clear notice if there
 * is no current academic session — a proprietor/principal/vice principal
 * must open one first (Permission tab → Sessions).
 */
const express = require("express");
const { db, logActivity } = require("./db");
const { authMiddleware, requireRole, LEADERSHIP_ROLES } = require("./auth");
const { hasActiveSession, currentSession } = require("./sessions");
const { subjectsForClass, levelForClass } = require("./subjects");

const router = express.Router();
const CAN_UPLOAD_SCORES = [...LEADERSHIP_ROLES, "class_teacher", "subject_teacher", "staff"];
const CAN_VIEW_ANY = [...LEADERSHIP_ROLES, "class_teacher", "subject_teacher", "staff"];
const CAN_EDIT_DOMAINS = [...LEADERSHIP_ROLES, "class_teacher"]; // per spec: leadership + class teacher only

const AFFECTIVE_TRAITS = ["Punctuality", "Class Attendance", "Reliability", "Neatness", "Politeness", "Honesty",
  "Relationship with Staff", "Relationship with Students", "Self Control", "Spirit of Co-operation", "Sense of Responsibility"];
const PSYCHOMOTOR_SKILLS = ["Handwriting", "Fluency / Verbal Skills", "Games", "Sports", "Handling Tools / Lab Equipment", "Drawing / Painting", "Crafts", "Musical Skills"];
const RATING_OPTIONS = ["excellent", "fair", "low", "poor"];

function remarkFor(total) {
  if (total <= 39) return "F9";
  if (total <= 44) return "B. Average";
  if (total <= 49) return "Fair";
  if (total <= 54) return "Average";
  if (total <= 59) return "Good";
  if (total <= 69) return "V. Good";
  return "Excellent";
}

function initialsFor(user) {
  const first = (user.firstName || "").trim()[0] || "";
  const last = (user.lastName || "").trim()[0] || "";
  return (first + last).toUpperCase();
}

function computeSubjectEntry(s, teacher) {
  const classwork = Number(s.classwork || 0), assignment = Number(s.assignment || 0),
        practical = Number(s.practical || 0), quiz = Number(s.quiz || 0),
        test = Number(s.test || 0), project = Number(s.project || 0), exam = Number(s.exam || 0);

  const firstCA = classwork + assignment + practical + quiz;   // max 20
  const secondCA = test + project;                              // max 20
  const total = firstCA + secondCA + exam;                      // max 100

  return {
    name: s.name,
    classwork, assignment, practical, quiz,          // feed the 1st CA
    test, project,                                     // feed the 2nd CA
    firstCA, secondCA, exam, total,
    remark: remarkFor(total),
    signature: initialsFor(teacher),
    uploadedBy: teacher.id
  };
}

function getStudentsInClass(classGrade) {
  return db.prepare("SELECT * FROM users WHERE role = 'student'").all()
    .filter((u) => {
      try { return JSON.parse(u.profile || "{}").academic?.classGrade === classGrade; } catch { return false; }
    });
}

function upsertSubjectScore(studentId, session, term, subjectEntry) {
  const existing = db.prepare("SELECT * FROM results WHERE studentId = ? AND session = ? AND term = ?").get(studentId, session, term);
  let subjects = existing ? JSON.parse(existing.subjects) : [];
  const idx = subjects.findIndex((s) => s.name === subjectEntry.name);
  if (idx >= 0) subjects[idx] = subjectEntry; else subjects.push(subjectEntry);

  db.prepare(`
    INSERT INTO results (studentId, session, term, subjects, position, teacherRemark, principalRemark)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(studentId, session, term) DO UPDATE SET subjects = excluded.subjects
  `).run(studentId, session, term, JSON.stringify(subjects), existing?.position || "-", existing?.teacherRemark || "", existing?.principalRemark || "");
}

function noActiveSessionResponse(res) {
  return res.status(409).json({
    success: false,
    message: "There is no current academic session open. Please notify the proprietor or principal to start a new session before scores can be uploaded or downloaded."
  });
}

// GET /api/results/subjects/:classGrade - which subjects apply to this class (junior vs senior list)
router.get("/subjects/:classGrade", authMiddleware, (req, res) => {
  const subjects = subjectsForClass(req.params.classGrade);
  if (!subjects.length) return res.status(400).json({ success: false, message: "Unrecognized class" });
  res.json({ success: true, classGrade: req.params.classGrade, level: levelForClass(req.params.classGrade), subjects });
});

// GET /api/results/class/:classGrade/:session/:term - grading grid for a class
router.get("/class/:classGrade/:session/:term", authMiddleware, requireRole(...CAN_VIEW_ANY), (req, res) => {
  const { classGrade, session, term } = req.params;
  const students = getStudentsInClass(classGrade).filter((s) => s.status === "active");
  const grid = students.map((s) => {
    const row = db.prepare("SELECT * FROM results WHERE studentId = ? AND session = ? AND term = ?").get(s.id, session, term);
    return { studentId: s.id, name: `${s.firstName} ${s.lastName}`, subjects: row ? JSON.parse(row.subjects) : [] };
  });
  res.json({ success: true, classGrade, session, term, subjects: subjectsForClass(classGrade), students: grid });
});

// POST /api/results/scores - save one subject's scores for a whole class
router.post("/scores", authMiddleware, requireRole(...CAN_UPLOAD_SCORES), (req, res) => {
  if (!hasActiveSession()) return noActiveSessionResponse(res);

  const { subject, session, term, scores } = req.body;
  if (!subject || !session || !term || !Array.isArray(scores)) {
    return res.status(400).json({ success: false, message: "subject, session, term and scores[] are required" });
  }
  if (session !== currentSession()) {
    return res.status(409).json({ success: false, message: `Scores can only be uploaded for the current session (${currentSession()}).` });
  }

  const teacher = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  scores.forEach((s) => {
    const entry = computeSubjectEntry({ ...s, name: subject }, teacher);
    upsertSubjectScore(s.studentId, session, term, entry);
  });

  logActivity(req.user.id, "scores_uploaded", { subject, session, term, count: scores.length });
  res.json({ success: true, message: `Saved ${subject} scores for ${scores.length} student(s), signed ${initialsFor(teacher)}` });
});

// GET /api/results/class/:classGrade/:session/:term/:subject/export.csv
router.get("/class/:classGrade/:session/:term/:subject/export.csv", authMiddleware, requireRole(...CAN_UPLOAD_SCORES), (req, res) => {
  if (!hasActiveSession()) return noActiveSessionResponse(res);

  const { classGrade, session, term, subject } = req.params;
  const students = getStudentsInClass(classGrade).filter((s) => s.status === "active");

  const rows = ["StudentID,Name,Subject,Classwork(5),Assignment(5),Practical(5),Quiz(5),Test(10),Project(10),Exam(60)"];
  students.forEach((s) => {
    const row = db.prepare("SELECT * FROM results WHERE studentId = ? AND session = ? AND term = ?").get(s.id, session, term);
    const subjects = row ? JSON.parse(row.subjects) : [];
    const existing = subjects.find((sub) => sub.name === subject) || {};
    rows.push([
      s.id, `"${s.firstName} ${s.lastName}"`, subject,
      existing.classwork || 0, existing.assignment || 0, existing.practical || 0,
      existing.quiz || 0, existing.test || 0, existing.project || 0, existing.exam || 0
    ].join(","));
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${classGrade}_${subject}_${term}.csv"`.replace(/\s+/g, "_"));
  res.send(rows.join("\n"));
});

// POST /api/results/import-csv
router.post("/import-csv", authMiddleware, requireRole(...CAN_UPLOAD_SCORES), (req, res) => {
  if (!hasActiveSession()) return noActiveSessionResponse(res);

  const { subject, session, term, csv } = req.body;
  if (!subject || !session || !term || !csv) {
    return res.status(400).json({ success: false, message: "subject, session, term and csv are required" });
  }
  if (session !== currentSession()) {
    return res.status(409).json({ success: false, message: `Scores can only be imported for the current session (${currentSession()}).` });
  }

  const teacher = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  const lines = csv.trim().split("\n").slice(1);
  let count = 0;
  lines.forEach((line) => {
    const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    if (!cols[0]) return;
    const [studentId, , , classwork, assignment, practical, quiz, test, project, exam] = cols;
    const entry = computeSubjectEntry({ name: subject, classwork, assignment, practical, quiz, test, project, exam }, teacher);
    upsertSubjectScore(studentId, session, term, entry);
    count++;
  });

  logActivity(req.user.id, "scores_imported", { subject, session, term, count });
  res.json({ success: true, message: `Imported scores for ${count} student(s)` });
});

// GET /api/results/:studentId/:session/:term/report - full report sheet data
router.get("/:studentId/:session/:term/report", authMiddleware, (req, res) => {
  const { studentId, session, term } = req.params;
  if (!CAN_VIEW_ANY.includes(req.user.role) && req.user.id !== studentId) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(studentId);
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });
  const studentProfile = JSON.parse(student.profile || "{}");
  const classGrade = studentProfile.academic?.classGrade;

  const row = db.prepare("SELECT * FROM results WHERE studentId = ? AND session = ? AND term = ?").get(studentId, session, term);
  if (!row) return res.status(404).json({ success: false, message: "No result found for this term" });
  const mySubjects = JSON.parse(row.subjects);

  // Class stats computed only among students who OFFER each subject
  const classmates = getStudentsInClass(classGrade).filter((s) => s.status === "active");
  const classmateSubjectRows = classmates.map((c) => {
    const r = db.prepare("SELECT * FROM results WHERE studentId = ? AND session = ? AND term = ?").get(c.id, session, term);
    return r ? JSON.parse(r.subjects) : [];
  }).flat();

  const enrichedSubjects = mySubjects.map((subj) => {
    const offeredTotals = classmateSubjectRows.filter((s) => s.name === subj.name).map((s) => s.total);
    return {
      ...subj,
      classLowest: offeredTotals.length ? Math.min(...offeredTotals) : subj.total,
      classHighest: offeredTotals.length ? Math.max(...offeredTotals) : subj.total,
      classAverage: offeredTotals.length ? Math.round(offeredTotals.reduce((a, b) => a + b, 0) / offeredTotals.length) : subj.total,
      noOffering: offeredTotals.length
    };
  });

  const domains = row.domains ? JSON.parse(row.domains) : { affective: {}, psychomotor: {} };
  const canStudentPrint = !!row.printApproved;

  res.json({
    success: true,
    report: {
      student: {
        id: student.id, name: `${student.firstName} ${student.lastName}`,
        classGrade, section: studentProfile.academic?.section,
        passportPhoto: student.passportPhoto
      },
      session, term,
      subjects: enrichedSubjects,
      noOfSubjects: enrichedSubjects.length,
      noInClass: classmates.length,
      teacherRemark: row.teacherRemark,
      principalRemark: row.principalRemark,
      affectiveTraits: AFFECTIVE_TRAITS,
      psychomotorSkills: PSYCHOMOTOR_SKILLS,
      domains,
      printApproved: canStudentPrint
      // Position / year average / years-position intentionally omitted, per instruction.
    }
  });
});

// PATCH /api/results/:studentId/:session/:term/domains - set affective/psychomotor ratings
// Per spec: leadership writes both sections + principal's comment; class teacher writes both
// sections + class teacher's comment. (Enforced by CAN_EDIT_DOMAINS above.)
router.patch("/:studentId/:session/:term/domains", authMiddleware, requireRole(...CAN_EDIT_DOMAINS), (req, res) => {
  const { studentId, session, term } = req.params;
  const { affective, psychomotor } = req.body;
  const row = db.prepare("SELECT * FROM results WHERE studentId = ? AND session = ? AND term = ?").get(studentId, session, term);
  if (!row) return res.status(404).json({ success: false, message: "No result found for this term" });

  function cleaned(input, allowedKeys) {
    const out = {};
    Object.entries(input || {}).forEach(([key, value]) => {
      if (allowedKeys.includes(key) && RATING_OPTIONS.includes(value)) out[key] = value;
    });
    return out;
  }

  const existing = row.domains ? JSON.parse(row.domains) : { affective: {}, psychomotor: {} };
  const domains = {
    affective: { ...existing.affective, ...cleaned(affective, AFFECTIVE_TRAITS) },
    psychomotor: { ...existing.psychomotor, ...cleaned(psychomotor, PSYCHOMOTOR_SKILLS) }
  };

  db.prepare("UPDATE results SET domains = ? WHERE studentId = ? AND session = ? AND term = ?")
    .run(JSON.stringify(domains), studentId, session, term);

  logActivity(req.user.id, "domains_updated", { studentId, term });
  res.json({ success: true, message: "Behaviour and skills ratings saved", domains });
});

// PATCH /api/results/:studentId/:session/:term/approve-print - leadership approves the student to print
router.patch("/:studentId/:session/:term/approve-print", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const { studentId, session, term } = req.params;
  const result = db.prepare("UPDATE results SET printApproved = 1 WHERE studentId = ? AND session = ? AND term = ?").run(studentId, session, term);
  if (result.changes === 0) return res.status(404).json({ success: false, message: "No result found for this term" });

  logActivity(req.user.id, "print_approved", { studentId, term });
  res.json({ success: true, message: "Student can now print this report sheet" });
});

// PATCH /api/results/:studentId/:session/:term/remarks
router.patch("/:studentId/:session/:term/remarks", authMiddleware, requireRole(...LEADERSHIP_ROLES, "class_teacher"), (req, res) => {
  const { studentId, session, term } = req.params;
  const { teacherRemark, principalRemark } = req.body;
  const row = db.prepare("SELECT * FROM results WHERE studentId = ? AND session = ? AND term = ?").get(studentId, session, term);
  if (!row) return res.status(404).json({ success: false, message: "No result found for this term" });

  const isLeadership = LEADERSHIP_ROLES.includes(req.user.role);
  db.prepare(`UPDATE results SET teacherRemark = ?, principalRemark = ? WHERE studentId = ? AND session = ? AND term = ?`).run(
    teacherRemark ?? row.teacherRemark,
    isLeadership ? (principalRemark ?? row.principalRemark) : row.principalRemark,
    studentId, session, term
  );

  logActivity(req.user.id, "remarks_updated", { studentId, term });
  res.json({ success: true, message: "Remarks saved" });
});

// GET /api/results/pending-print/:session/:term - reports not yet approved for student printing
router.get("/pending-print/:session/:term", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const { session, term } = req.params;
  const rows = db.prepare("SELECT * FROM results WHERE session = ? AND term = ? AND printApproved = 0").all(session, term);
  const withNames = rows.map((r) => {
    const student = db.prepare("SELECT firstName, lastName FROM users WHERE id = ?").get(r.studentId);
    return { studentId: r.studentId, name: student ? `${student.firstName} ${student.lastName}` : r.studentId };
  });
  res.json({ success: true, pending: withNames });
});

router.delete("/:studentId/:session/:term", authMiddleware, requireRole(...LEADERSHIP_ROLES), (req, res) => {
  const result = db.prepare("DELETE FROM results WHERE studentId = ? AND session = ? AND term = ?")
    .run(req.params.studentId, req.params.session, req.params.term);
  if (result.changes === 0) return res.status(404).json({ success: false, message: "Result not found" });
  logActivity(req.user.id, "result_deleted", { studentId: req.params.studentId, term: req.params.term });
  res.json({ success: true, message: "Result deleted" });
});

module.exports = router;
