// routes/settings.js
// Sysadmin-only: configure the AI provider + API key at runtime instead of
// through a .env file, so a fresh deploy needs no shell access to go live -
// log in as admin, paste the key once, and the lab is running.

const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getAIConfig, setAIConfig } = require("../lib/aiConfig");

const router = express.Router();

function maskKey(key) {
  if (!key || key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

router.get("/ai", requireAuth, requireRole("admin"), (req, res) => {
  const config = getAIConfig();
  res.json({
    provider: config.provider,
    configured: Boolean(config.apiKey),
    apiKeyMasked: config.apiKey ? maskKey(config.apiKey) : null,
  });
});

router.post("/ai", requireAuth, requireRole("admin"), (req, res) => {
  const { provider, apiKey } = req.body;

  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: "API key is required." });
  }

  setAIConfig((provider || "gemini").trim(), apiKey.trim());
  res.json({ ok: true });
});

module.exports = router;
