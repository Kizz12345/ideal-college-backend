/**
 * Authentication routes - Ideal College
 *
 * LOGIN RULES (per school spec):
 * - Students log in with a generated username: admissionYear + admissionNumber (e.g. "20260001")
 *   Their initial password is their surname, lowercase. They can change/reset it after.
 * - Staff (proprietor, principal, vice principal, class/subject teacher, general staff) and
 *   the hidden developer account log in with their EMAIL address + the password they chose
 *   when their account was created.
 *
 * PASSWORD RESET — a security note worth understanding:
 * Passwords are stored as one-way hashes, so we can never "look up and re-send" someone's
 * original password by email — that's not something any properly-built system can do, hashing
 * makes it mathematically impossible to reverse. Instead, both students and staff get a secure
 * time-limited RESET LINK emailed to the address on file. This is the safer, standard approach
 * and satisfies the spirit of the "forgot password" requirement for both account types.
 */
const express = require("express");
const crypto = require("crypto");
const { db, hash, logActivity } = require("./db");

const router = express.Router();
const SECRET = process.env.JWT_SECRET || "ideal-college-secret-key"; // set JWT_SECRET in Render env vars for production

function generateStudentUsername(admissionYear, admissionNumber) {
  const paddedNumber = String(admissionNumber).padStart(4, "0");
  return `${admissionYear}${paddedNumber}`;
}

function generateToken(user) {
  const payload = `${user.id}:${user.role}:${Date.now()}`;
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64");
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [id, role, ts, signature] = decoded.split(":");
    const expected = crypto.createHmac("sha256", SECRET).update(`${id}:${role}:${ts}`).digest("hex");
    if (signature !== expected) return null;
    return { id, role };
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }
  const decoded = verifyToken(header.split(" ")[1]);
  if (!decoded) return res.status(401).json({ success: false, message: "Invalid or expired token" });
  req.user = decoded;
  next();
}

const STAFF_ROLES = ["developer", "proprietor", "principal", "vice_principal", "class_teacher", "subject_teacher", "staff"];
const LEADERSHIP_ROLES = ["developer", "proprietor", "principal", "vice_principal"];

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: `Restricted to: ${roles.join(", ")}` });
    }
    next();
  };
}

function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return { ...rest, profile: rest.profile ? JSON.parse(rest.profile) : null };
}

// POST /api/auth/login  { id, password }
// `id` is a student username (e.g. 20260001) OR an email address for everyone else.
router.post("/login", (req, res) => {
  const { id, password } = req.body;
  if (!id || !password) {
    return res.status(400).json({ success: false, message: "ID/email and password are required" });
  }

  const isEmailFormat = id.includes("@");
  const user = isEmailFormat
    ? db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(id)
    : db.prepare("SELECT * FROM users WHERE id = ? COLLATE NOCASE").get(id);

  if (!user || user.passwordHash !== hash(password)) {
    return res.status(401).json({ success: false, message: "Invalid ID/email or password" });
  }

  // Extra guard: students must use their username, not email; staff must use email.
  if (user.role === "student" && isEmailFormat) {
    return res.status(401).json({ success: false, message: "Students should log in with their student ID, not email" });
  }
  if (STAFF_ROLES.includes(user.role) && !isEmailFormat) {
    return res.status(401).json({ success: false, message: "Staff should log in with their email address" });
  }

  if (user.status === "pending") {
    return res.status(403).json({ success: false, message: "Account awaiting approval by the proprietor, principal or vice principal" });
  }
  if (user.status === "rejected") {
    return res.status(403).json({ success: false, message: "This registration was declined. Contact the school office" });
  }

  const token = generateToken(user);
  logActivity(user.id, "login", { role: user.role });

  res.json({ success: true, message: "Login successful", token, user: safeUser(user) });
});

// GET /api/auth/me
router.get("/me", authMiddleware, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, user: safeUser(user) });
});

// ---------- Forgot password ----------
// POST /api/auth/forgot-password  { id }  (student username OR staff/admin email)
router.post("/forgot-password", (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success: false, message: "Enter your student ID or email" });

  const isEmailFormat = id.includes("@");
  const user = isEmailFormat
    ? db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(id)
    : db.prepare("SELECT * FROM users WHERE id = ? COLLATE NOCASE").get(id);

  // Always respond the same way whether or not the account exists — this avoids
  // letting someone probe which IDs/emails are registered on the site.
  const genericResponse = { success: true, message: "If that account exists, a reset link has been sent to the email on file." };
  if (!user || !user.email) return res.json(genericResponse);

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
  db.prepare("INSERT INTO password_resets (token, userId, expiresAt) VALUES (?, ?, ?)").run(token, user.id, expiresAt);

  // Sends the email if SMTP is configured (see mailer.js). Safe to call even if not configured yet —
  // it just logs the link to the server console instead, so you can test the flow before wiring email.
  require("./mailer").sendPasswordResetEmail(user.email, token, user.role);

  logActivity(user.id, "password_reset_requested");
  res.json(genericResponse);
});

// POST /api/auth/reset-password  { token, newPassword }
router.post("/reset-password", (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: "Reset token and new password are required" });
  }

  const record = db.prepare("SELECT * FROM password_resets WHERE token = ?").get(token);
  if (!record) return res.status(400).json({ success: false, message: "Invalid or already-used reset link" });
  if (record.usedAt) return res.status(400).json({ success: false, message: "This reset link has already been used" });
  if (new Date(record.expiresAt) < new Date()) {
    return res.status(400).json({ success: false, message: "This reset link has expired. Request a new one" });
  }

  db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?").run(hash(newPassword), record.userId);
  db.prepare("UPDATE password_resets SET usedAt = datetime('now') WHERE token = ?").run(token);

  logActivity(record.userId, "password_reset_completed");
  res.json({ success: true, message: "Password updated. You can now log in with your new password." });
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
module.exports.requireRole = requireRole;
module.exports.generateStudentUsername = generateStudentUsername;
module.exports.safeUser = safeUser;
module.exports.STAFF_ROLES = STAFF_ROLES;
module.exports.LEADERSHIP_ROLES = LEADERSHIP_ROLES;
