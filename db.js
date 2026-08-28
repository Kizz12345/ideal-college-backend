/**
 * IDEAL COLLEGE, Ijokodo-Agbaje
 * Database layer - uses Node's BUILT-IN SQLite module (node:sqlite).
 * No npm install needed for the database, no native compiling,
 * works out of the box on Render (Node 22.13+ / Node 24+ / Node 26).
 */
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const path = require("path");

const db = new DatabaseSync(path.join(__dirname, "school.db"));

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  fullName TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','principal','staff','student')),
  gender TEXT,
  phone TEXT,
  address TEXT,
  passwordHash TEXT NOT NULL,

  class TEXT,
  guardianName TEXT,
  guardianPhone TEXT,

  department TEXT,
  subjectsTaught TEXT,

  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','rejected')),
  createdBy TEXT,
  approvedBy TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  decidedAt TEXT
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId TEXT NOT NULL,
  session TEXT NOT NULL,
  term TEXT NOT NULL,
  subjects TEXT NOT NULL,
  position TEXT,
  teacherRemark TEXT,
  principalRemark TEXT,
  UNIQUE(studentId, session, term)
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

// ---------- Seed (only runs once) ----------
const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
if (userCount === 0) {
  const insert = db.prepare(`
    INSERT INTO users (id, fullName, role, gender, phone, address, passwordHash, class, guardianName, guardianPhone, department, subjectsTaught, status, createdBy, approvedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run("ADMIN/001", "Mrs. Folasade Ojo", "admin", "Female", "08012345678", "Ijokodo, Ibadan", hash("admin123"), null, null, null, "Administration", null, "active", "system", "system");

  insert.run("PRINCIPAL/001", "Dr. Emeka Obi", "principal", "Male", "08099999999", "Agbaje, Ibadan", hash("principal123"), null, null, null, "Principal's Office", null, "active", "system", "system");

  insert.run("ICS/2025/001", "Adebayo Oluwaseun", "student", "Male", null, "Ijokodo, Ibadan", hash("student123"), "JSS 3", "Mr. Adebayo Tunde", "08031234567", null, null, "active", "ADMIN/001", "PRINCIPAL/001");

  db.prepare(`
    INSERT INTO terms (id, currentSession, currentTerm, resumptionDate, vacationDate)
    VALUES (1, '2025/2026', 'First Term', '2026-09-14', '2026-12-12')
  `).run();

  console.log("Database seeded: ADMIN/001 (admin123), PRINCIPAL/001 (principal123), ICS/2025/001 (student123)");
}

module.exports = { db, hash };
