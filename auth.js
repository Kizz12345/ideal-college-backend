/**
 * Authentication routes - Ideal College (SQLite-backed)
 */
const express = require("express");
const crypto = require("crypto");
const { db, hash } = require("./db");

const router = express.Router();
const SECRET = "ideal-college-secret-key"; // move to process.env.JWT_SECRET in production

function generateToken(user) {
  const payload = `${user.id}:${user.role}:${Date.now()}`;
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64");
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [id, role, ts, sig``nature] = decoded.split(":");
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

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: `Restricted to: ${roles.join(", ")}` });
    }
    next();
  };
}

// POST /api/auth/login  { id, password }
router.post("/login", (req, res) => {
  const { id, password } = req.body;
  if (!id || !password) {
    return res.status(400).json({ success: false, message: "ID and password are required" });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ? COLLATE NOCASE").get(id);
  if (!user || user.passwordHash !== hash(password)) {
    return res.status(401).json({ success: false, message: "Invalid ID or password" });
  }

  if (user.status === "pending") {
    return res.status(403).json({ success: false, message: "Account awaiting principal's approval" });
  }
  if (user.status === "rejected") {
    return res.status(403).json({ success: false, message: "Account was rejected. Contact the school admin" });
  }

  const token = generateToken(user);
  res.json({
    success: true,
    message: "Login successful",
    token,
    user: { id: user.id, fullName: user.fullName, role: user.role, class: user.class || null }
  });
});

// GET /api/auth/me
router.get("/me", authMiddleware, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  const { passwordHash, ...safe } = user;
  res.json({ success: true, user: safe });
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
module.exports.requireRole = requireRole;
