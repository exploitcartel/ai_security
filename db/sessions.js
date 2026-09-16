// db/sessions.js
// Deliberately simple in-memory session store for this lab.
// SESSIONS: Map<token, userObject>
// Lost on server restart - that's fine for a demo.

const SESSIONS = new Map();

module.exports = SESSIONS;
