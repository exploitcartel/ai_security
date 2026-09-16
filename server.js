// server.js
require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");
const agentRoutes = require("./routes/agent");
const { getSessionUser } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Deliberately permissive CORS (lab only) --------------------------
// Allows the attacker-controlled origin (e.g. a page served from Kali on
// 172.20.10.7:8080) to make credentialed requests against this API. No
// Content-Security-Policy, no Referrer-Policy, no helmet-style hardening.
const ALLOWED_ORIGINS = [
  "http://172.20.10.7:8080",
  "http://172.20.10.5:3000",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow no-origin requests (curl/garak) and anything in the allowlist
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      // NOTE: for an even more permissive lab, replace the above with:
      // return callback(null, true); // reflect any origin
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// --- GET /dashboard - server-side gated by the SESSIONID cookie only ---
// No CSRF token, no IP/User-Agent binding, no session rotation.
app.get("/dashboard", (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/dashboard.html", (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoutes);
app.use("/api", apiRoutes);
app.use("/api/agent", agentRoutes);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Ventify Finance running at http://0.0.0.0:${PORT}`);
  console.log("WARNING: this build is intentionally vulnerable (lab use only).");
});
