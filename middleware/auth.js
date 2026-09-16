// middleware/auth.js
const SESSIONS = require("../db/sessions");

// NOTE FOR THE LAB: this reads the SESSIONID cookie manually. The cookie
// itself is issued without HttpOnly/Secure and with SameSite=Lax (see
// routes/auth.js), so it is readable by JavaScript and gets attached on
// cross-site navigations/GETs. That is intentional for the demo.

function getSessionUser(req) {
  const token = req.cookies ? req.cookies.SESSIONID : null;
  if (!token) return null;
  return SESSIONS.get(token) || null;
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Not logged in." });
  req.currentUser = user;
  next();
}

function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.currentUser) return res.status(401).json({ error: "Not logged in." });
    if (!roles.includes(req.currentUser.role)) {
      return res.status(403).json({ error: "You don't have permission to do that." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, getSessionUser };
