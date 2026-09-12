/**
 * IDEAL COLLEGE, Ijokodo-Agbaje
 * Main backend server
 */
const express = require("express");
const cors = require("cors");

require("./db"); // initializes school.db and seeds default accounts on first run

const authRoutes = require("./auth");
const studentRoutes = require("./students");
const staffRoutes = require("./staff");
const resultRoutes = require("./results");
const sessionRoutes = require("./sessions");
const termRoutes = require("./terms");
const calendarRoutes = require("./calendar");
const galleryRoutes = require("./gallery");
const newsletterRoutes = require("./newsletters");
const activityRoutes = require("./activity");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
// Raised from the default 100kb — passport photos and newsletter files are sent as base64.
app.use(express.json({ limit: "15mb" }));

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
app.use("/api/sessions", sessionRoutes);
app.use("/api/terms", termRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/gallery", galleryRoutes);
app.use("/api/newsletters", newsletterRoutes);
app.use("/api/activity", activityRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`IDEAL COLLEGE server running on http://localhost:${PORT}`);
});
