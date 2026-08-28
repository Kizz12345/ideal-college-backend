/**
 * IDEAL COLLEGE, Ijokodo-Agbaje
 * Database layer - SQLite (file-based, real DB, no separate server needed)
 * Run: npm install better-sqlite3
 */
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");

const db = new Database(path.join(__dirname, "..", "school.db"));
db.pragma("journal_mode = WAL");

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

  -- student-only fields
  class TEXT,
  guardianName TEXT,
  guardianPhone TEXT,

  -- staff-only fields
  department TEXT,
  subjectsTaught TEXT,

  -- approval workflow
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
  subjects TEXT NOT NULL,       -- JSON array: [{name,ca,exam,total,grade}]
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

// ---------- Helpers ----------
function hash(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// ---------- Seed (only runs once, if tables are empty) ----------
const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
if (userCount === 0) {
  const insert = db.prepare(`
    INSERT INTO users (id, fullName, role, gender, phone, address, passwordHash, class, guardianName, guardianPhone, department, subjectsTaught, status, createdBy, approvedBy)
    VALUES (@id,@fullName,@role,@gender,@phone,@address,@passwordHash,@class,@guardianName,@guardianPhone,@department,@subjectsTaught,@status,@createdBy,@approvedBy)
  `);

  insert.run({
    id: "ADMIN/001", fullName: "Mrs. Folasade Ojo", role: "admin", gender: "Female",
    phone: "08012345678", address: "Ijokodo, Ibadan", passwordHash: hash("admin123"),
    class: null, guardianName: null, guardianPhone: null, department: "Administration",
    subjectsTaught: null, status: "active", createdBy: "system", approvedBy: "system"
  });

  insert.run({
    id: "PRINCIPAL/001", fullName: "Dr. Emeka Obi", role: "principal", gender: "Male",
    phone: "08099999999", address: "Agbaje, Ibadan", passwordHash: hash("principal123"),
    class: null, guardianName: null, guardianPhone: null, department: "Principal's Office",
    subjectsTaught: null, status: "active", createdBy: "system", approvedBy: "system"
  });

  insert.run({
    id: "ICS/2025/001", fullName: "Adebayo Oluwaseun", role: "student", gender: "Male",
    phone: null, address: "Ijokodo, Ibadan", passwordHash: hash("student123"),
    class: "JSS 3", guardianName: "Mr. Adebayo Tunde", guardianPhone: "08031234567",
    department: null, subjectsTaught: null, status: "active", createdBy: "ADMIN/001", approvedBy: "PRINCIPAL/001"
  });

  db.prepare(`
    INSERT INTO terms (id, currentSession, currentTerm, resumptionDate, vacationDate)
    VALUES (1, '2025/2026', 'First Term', '2026-09-14', '2026-12-12')
  `).run();

  console.log("Database seeded: ADMIN/001 (admin123), PRINCIPAL/001 (principal123), ICS/2025/001 (student123)");
}

module.exports = { db, hash };
