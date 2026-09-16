// routes/auth.js
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db/connection");
const SESSIONS = require("../db/sessions");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  // --- Deliberately weak session issuance (lab only) ------------------
  // Equivalent of Python's secrets.token_hex(16): 16 random bytes, hex-encoded.
  const token = crypto.randomBytes(16).toString("hex");

  let companyName = null;
  if (user.client_id) {
    const c = db.prepare("SELECT name FROM clients WHERE id = ?").get(user.client_id);
    companyName = c ? c.name : null;
  }

  const sessionUser = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    clientId: user.client_id,
    companyName,
  };

  SESSIONS.set(token, sessionUser);

  // No HttpOnly, no Secure, SameSite=Lax, Path=/, no Domain restriction.
  // This is intentional for the lab: the cookie must be readable by
  // JavaScript / a browser extension, and must be sendable cross-site.
  res.cookie("SESSIONID", token, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: false,
  });

  res.json(sessionUser);
});

router.get("/logout", (req, res) => {
  const token = req.cookies ? req.cookies.SESSIONID : null;
  if (token) SESSIONS.delete(token);
  res.clearCookie("SESSIONID", { path: "/" });
  res.redirect("/");
});

router.get("/me", requireAuth, (req, res) => {
  res.json(req.currentUser);
});

router.post("/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.currentUser.id);

  if (!user || !bcrypt.compareSync(currentPassword || "", user.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, user.id);

  res.json({ ok: true, message: "Password updated successfully." });
});

module.exports = router;
