/* ═══════════════════════════════════════════════════════════════════
   COLLECTOR — serves the prototype and saves each session as files on
   this machine (client switch: Config.CONFIG.fileLogging).

   One endpoint:
     POST /collect-logs  → session snapshot (+ event stream, if any).

   1. The client POSTs the WHOLE session at every step boundary, so the
      snapshot is always complete; only events not yet on disk are appended
      to the JSONL stream.
   2. One FOLDER per participant, named <timestamp>_<participant ID>. It is
      only created once the participant has typed their ID — until then the
      session carries no `logFolder` and nothing is written.
   3. The folder name is sanitised before it touches a path.
   4. No IP address is recorded anywhere.

   The log directory is ./logs inside the project. It is git-ignored as a
   whole (/logs/ in .gitignore), so it is never committed or pushed, and
   checkout / pull / reset leave it alone. It is never served over HTTP.
   If it — or a participant's folder — is deleted, it is simply made again:
   at start-up, and before every write. Override with LOG_DIR=/some/path.

   Run:  npm install && npm start        (or: PORT=8080 node server.js)
   ═══════════════════════════════════════════════════════════════════ */
const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const PORT = process.env.PORT || 8080;
const LOG_DIR = path.resolve(process.env.LOG_DIR || path.join(__dirname, "logs"));

/* ── one folder per participant ──────────────────────────────────────
       <LOG_DIR>/<YYYY-MM-DD_HH-MM-SS>_<participant ID>/session.json
       <LOG_DIR>/<YYYY-MM-DD_HH-MM-SS>_<participant ID>/events.jsonl   (only once events exist)

   Everything from one person's run sits together, so a single run can be
   handed on, archived or deleted as a unit — which is what a participant
   withdrawing actually requires. The timestamp is when the ID was entered.
 */
const runDir      = folder => path.join(LOG_DIR, folder);
const sessionFile = folder => path.join(runDir(folder), "session.json");
const eventLog    = folder => path.join(runDir(folder), "events.jsonl");


/* No IP address is ever recorded. An IP is personal data under GDPR and
   would pull this study into heavier consent/retention obligations for no
   research benefit — the participant id already links the rows. */

fs.mkdirSync(LOG_DIR, { recursive: true });   // each participant's folder is made once their ID is in

const app = express();
app.use(express.json({ limit: "25mb" }));

/* The logs live inside the served directory, so serve nothing from them —
   otherwise GET /logs/<folder>/session.json hands one participant another's data. */
app.use((req, res, next) => {
  const p = decodeURIComponent(req.path).replace(/\\/g, "/");
  if (/^\/(logs|_archive|node_modules)(\/|$)/.test(p) || p.includes("..")) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  next();
});
app.use(express.static(__dirname, { dotfiles: "ignore", index: "index.html" }));

/* logFolder → a safe folder name (letters, digits, - and _ only), or "" if nothing is left. */
function safeFolder(raw) {
  return String(raw == null ? "" : raw).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96);
}

/* Serialise writes per participant: two step boundaries can arrive close
   together, and read-then-write must not interleave. */
const chains = new Map();
function queue(id, job) {
  const prev = chains.get(id) || Promise.resolve();
  const next = prev.then(job, job);
  chains.set(id, next.catch(() => {}));
  return next;
}

// Write via temp file + rename so a crash can never leave a half-written snapshot.
async function writeAtomic(file, text) {
  const tmp = file + ".tmp";
  await fsp.writeFile(tmp, text, "utf8");
  await fsp.rename(tmp, file);
}


app.post("/collect-logs", async (req, res) => {
  const session = req.body;
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    return res.status(400).json({ ok: false, error: "expected a session object" });
  }

  // No participant ID yet → no folder yet. Acknowledge, write nothing.
  const id = safeFolder(session.logFolder);
  if (!id) return res.json({ ok: true, skipped: "no participant ID yet" });

  const snapshot = sessionFile(id);
  const receivedAt = new Date().toISOString();
  const events = Array.isArray(session.events) ? session.events : [];

  try {
    const appended = await queue(id, async () => {
      // The participant's folder (and logs/ itself), made on their first sync after the ID —
      // and again if either was deleted since: every write checks.
      await fsp.mkdir(runDir(id), { recursive: true });

      // How many of this participant's events are already on disk?
      let known = 0;
      try {
        const prev = JSON.parse(await fsp.readFile(snapshot, "utf8"));
        known = Array.isArray(prev.events) ? prev.events.length : 0;
      } catch (e) { /* first sync for this participant */ }

      // Snapshot first: it is the record of truth and is idempotent, so a
      // dropped request is healed by the next one (each carries everything).
      await writeAtomic(snapshot, JSON.stringify(
        { ...session, receivedAt, savedBy: "collector/1" }, null, 2
      ));

      // Then append only what is new, one JSON object per line.
      const fresh = events.slice(known);
      if (fresh.length) {
        const lines = fresh.map(ev => JSON.stringify({
          participant: session.anonId,
          lang: session.lang,
          ...ev,
          serverTimestamp: receivedAt,
        })).join("\n") + "\n";
        await fsp.appendFile(eventLog(id), lines, "utf8");
      }
      return fresh.length;
    });


    res.json({ ok: true, folder: id, totalEvents: events.length, appendedEvents: appended });
  } catch (err) {
    console.error("save failed for", id, err);
    res.status(500).json({ ok: false, error: "write failed" });
  }
});

// Quick check that the collector is alive and where it is writing.
app.get("/collect-logs/health", async (_req, res) => {
  let sessions = 0;
  try {
    const entries = await fsp.readdir(LOG_DIR, { withFileTypes: true });
    sessions = entries.filter(e => e.isDirectory()).length;
  } catch (e) { /* none yet */ }
  res.json({ ok: true, logDir: LOG_DIR, sessions });
});

/* Clean JSON errors. Without this, malformed JSON or an oversized body gets
   Express's default HTML page — including a stack trace with absolute
   filesystem paths, which should never leave a machine that is port-forwarded. */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error("collector error:", err.message);
  res.status(status).json({
    ok: false,
    error: status === 413 ? "payload too large"
         : status === 400 ? "malformed JSON"
         : "server error",
  });
});

app.listen(PORT, () => {
  console.log(`BDR — AI-use prototype + collector on http://localhost:${PORT}`);
  console.log(`log files (when Config.CONFIG.fileLogging is on): ${LOG_DIR}`);
  console.log("  <YYYY-MM-DD_HH-MM-SS>_<participant ID>/session.json");
});
