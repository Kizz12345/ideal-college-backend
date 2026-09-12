/**
 * IDEAL COLLEGE, Ijokodo-Agbaje
 * Database layer - node:sqlite (built into Node, no native compiling)
 *
 * Design note: students and staff have very different profile fields
 * (admission/parent info vs employment/qualification info), so beyond
 * the shared core columns, role-specific details are stored as a JSON
 * blob in `profile`. This keeps one flexible `users` table instead of
 * several sparse ones, while still being a real, queryable database.
 */
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const path = require("path");

const db = new DatabaseSync(path.join(__dirname, "school.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,               -- student username (e.g. 20260001) or staff/admin email or 'DEV/ROOT'
  role TEXT NOT NULL CHECK(role IN ('developer','proprietor','principal','vice_principal','class_teacher','subject_teacher','staff','non_teaching_staff','student')),
  firstName TEXT,
  middleName TEXT,
  lastName TEXT,
  email TEXT,
  phone TEXT,
  passportPhoto TEXT,                -- file path/URL to uploaded passport photo
  passwordHash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected')),
  profile TEXT,                      -- JSON: role-specific fields (admission info, parent/guardian, employment, education, etc.)
  createdBy TEXT,
  approvedBy TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  decidedAt TEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  usedAt TEXT
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId TEXT NOT NULL,
  session TEXT NOT NULL,
  term TEXT NOT NULL,
  subjects TEXT NOT NULL,            -- JSON array of {name, classwork, assignment, practical, quiz, test, project, exam, caTotal, examTotal, total, grade}
  position TEXT,
  teacherRemark TEXT,
  principalRemark TEXT,
  domains TEXT,                      -- JSON: {affective: {trait: rating}, psychomotor: {skill: rating}}
  printApproved INTEGER NOT NULL DEFAULT 0,
  UNIQUE(studentId, session, term)
);

CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imagePath TEXT NOT NULL,
  caption TEXT,
  uploadedBy TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approvedBy TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS newsletters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  filePath TEXT NOT NULL,
  uploadedBy TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS academic_calendar (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fileName TEXT,
  fileData TEXT,                     -- base64 data URI (PDF or Word)
  uploadedBy TEXT,
  uploadedAt TEXT
);

CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  currentSession TEXT,
  currentTerm TEXT,
  resumptionDate TEXT,
  vacationDate TEXT
);
`);

function hash(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function logActivity(userId, action, details = "") {
  db.prepare(`INSERT INTO activity_log (userId, action, details) VALUES (?, ?, ?)`)
    .run(userId, action, typeof details === "string" ? details : JSON.stringify(details));
}

// ---------- Seed (only runs once) ----------
const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
if (userCount === 0) {
  const insert = db.prepare(`
    INSERT INTO users (id, role, firstName, middleName, lastName, email, phone, passwordHash, status, profile, createdBy, approvedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'system', 'system')
  `);

  // Hidden developer account — never returned by any "list users" query (all of them filter role != 'developer').
  // CHANGE THIS PASSWORD before going live, then forget you ever saw it written down anywhere.
  insert.run(
    "dev@idealcollege.internal", "developer", "Site", null, "Developer",
    "dev@idealcollege.internal", null, hash("ChangeThisDevPassword!2026"),
    JSON.stringify({ note: "Full access, hidden from all user lists and activity views by anyone but the developer." })
  );

  insert.run(
    "proprietor@idealcollege.edu.ng", "proprietor", "Folasade", null, "Ojo",
    "proprietor@idealcollege.edu.ng", "08012345678", hash("admin123"),
    JSON.stringify({ designation: "Proprietor" })
  );

  insert.run(
    "principal@idealcollege.edu.ng", "principal", "Emeka", null, "Obi",
    "principal@idealcollege.edu.ng", "08099999999", hash("principal123"),
    JSON.stringify({ designation: "Principal" })
  );

  insert.run(
    "20260001", "student", "Adebayo", null, "Oluwaseun",
    "adebayo.student@example.com", null, hash("oluwaseun"),
    JSON.stringify({
      admissionDate: "2026-09-01", admissionYear: "2026", admissionNumber: "0001",
      classGrade: "JSS 3", section: "2026/2027",
      guardian: { fatherName: "Mr. Adebayo Tunde", fatherContact: "08031234567" }
    })
  );

  db.prepare(`
    INSERT INTO terms (id, currentSession, currentTerm, resumptionDate, vacationDate)
    VALUES (1, '2025/2026', 'First Term', '2026-09-14', '2026-12-12')
  `).run();

  console.log("Database seeded.");
  console.log("Proprietor: proprietor@idealcollege.edu.ng / admin123");
  console.log("Principal:  principal@idealcollege.edu.ng / principal123");
  console.log("Student:    20260001 / oluwaseun (username = admission year + number, password = surname)");
}

module.exports = { db, hash, logActivity };
