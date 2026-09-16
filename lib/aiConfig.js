// lib/aiConfig.js
// The AI provider + API key are configured at runtime by a sysadmin (Settings
// > AI Provider in the dashboard), not baked into .env. This is the only
// piece of this lab that is actually sensitive, so it lives in the SQLite
// settings table instead of a committed file. Cached in memory and
// invalidated on every write.

const db = require("../db/connection");

const DEFAULT_MODEL = "gemini-2.5-flash";

let cache = null;

function ensureTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
}

function getAIConfig() {
  if (cache) return cache;
  ensureTable();
  const provider = db.prepare("SELECT value FROM settings WHERE key = 'ai_provider'").get();
  const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'ai_api_key'").get();
  const model = db.prepare("SELECT value FROM settings WHERE key = 'ai_model'").get();
  cache = {
    provider: provider ? provider.value : "gemini",
    apiKey: apiKey ? apiKey.value : null,
    model: model && model.value ? model.value : DEFAULT_MODEL,
  };
  return cache;
}

function setAIConfig(provider, apiKey, model) {
  ensureTable();
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const resolvedModel = model && model.trim() ? model.trim() : DEFAULT_MODEL;
  upsert.run("ai_provider", provider);
  upsert.run("ai_api_key", apiKey);
  upsert.run("ai_model", resolvedModel);
  cache = { provider, apiKey, model: resolvedModel };
}

module.exports = { getAIConfig, setAIConfig, DEFAULT_MODEL };
