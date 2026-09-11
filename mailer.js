/**
 * Email utility - Ideal College
 *
 * Until you configure real email credentials, reset links are printed to
 * the Render logs instead of actually emailed — so you can test the whole
 * flow right now without setting anything up.
 *
 * To send REAL emails later, add these environment variables in Render
 * (Dashboard → your service → Environment):
 *   SMTP_HOST      e.g. smtp.gmail.com
 *   SMTP_PORT      e.g. 465
 *   SMTP_USER      the sending email address
 *   SMTP_PASS      an App Password (NOT your normal Gmail password —
 *                  Google requires a 16-character "App Password" for this;
 *                  generate one at myaccount.google.com/apppasswords)
 *   SITE_URL       e.g. https://idealcollege.site.je
 */
let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  // nodemailer not installed yet — fine, we fall back to console-logging the link below.
}

function getTransporter() {
  if (!nodemailer || !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendPasswordResetEmail(toEmail, token, role) {
  const siteUrl = process.env.SITE_URL || "https://idealcollege.site.je";
  const resetPage = role === "student" ? "reset-password.html" : "reset-password.html";
  const link = `${siteUrl}/${resetPage}?token=${token}`;

  const transporter = getTransporter();
  if (!transporter) {
    console.log("=================================================");
    console.log("PASSWORD RESET LINK (email not configured yet):");
    console.log(`To: ${toEmail}`);
    console.log(link);
    console.log("=================================================");
    return { sent: false, previewLink: link };
  }

  await transporter.sendMail({
    from: `"Ideal College" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Reset your Ideal College password",
    html: `
      <p>Hello,</p>
      <p>We received a request to reset your Ideal College account password.</p>
      <p><a href="${link}">Click here to reset your password</a> (this link expires in 30 minutes).</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p>— Ideal College, Ijokodo-Agbaje</p>
    `
  });

  return { sent: true };
}

module.exports = { sendPasswordResetEmail };
