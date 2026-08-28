/**
 * IDEAL COLLEGE, Ijokodo-Agbaje
 * Main backend server
 * Run: npm install && npm start
 */
const express = require("express");
const cors = require("cors");
const path = require("path");

require("./db"); // initializes school.db and seeds default accounts on first run

const authRoutes = require("./auth");
const studentRoutes = require("./students");
const staffRoutes = require("./staff");
const resultRoutes = require("./results");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.get("/api/school", (req, res) => {
  res.json({
    name: "IDEAL COLLEGE",
    motto: "Knowledge, Character, Excellence",
    location: "Ijokodo, Agbaje, Ibadan, Oyo State",
    address: "Along Ijokodo Road, Agbaje, Ibadan, Oyo State, Nigeria",
    phone: "0803 000 0000",
    email: "info@idealcollege.edu.ng"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/results", resultRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`IDEAL COLLEGE server running on http://localhost:${PORT}`);
  console.log(`Database file: school.db (created automatically in project root)`);
});
