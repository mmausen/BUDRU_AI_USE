/* ═══════════════════════════════════════════════════════════════════
   STORE — single source of truth for the session, and the logging
   pipeline. Carried over from the designing-trust prototype, trimmed:

   - Holds one `data` object (participant, steps, surveys, results, events).
   - Autosaves to localStorage after every mutation (crash/refresh safety).
   - A session being replaced is archived first, so a second run in the same
     browser can never silently destroy the first.
   - sendRemote() POSTs the COMPLETE session to the collector (server.js) at
     step boundaries; flush() is the sendBeacon last-gasp on tab close.

   ⚠ The pipeline is in place but NOTHING emits study data yet: no module
   calls log(), addResult() or setSurvey(). Wire those in once the measures
   are decided — see README "Logging".
   ═══════════════════════════════════════════════════════════════════ */
window.Store = (function () {
  const KEY = "bdr_aiuse_session";
  const ARCHIVE_KEY = "bdr_aiuse_archive";
  const ARCHIVE_MAX = 10;
  const SCHEMA_VERSION = 1;
  const perfStart = performance.now();
  let data = null;

  // Master switch (Config.CONFIG.loggingEnabled). Off → no events, no POST, no beacon.
  const logging = () => Config.CONFIG.loggingEnabled !== false;

  function newSession(pid) {
    archiveCurrent("replaced by a new session");
    data = {
      schemaVersion: SCHEMA_VERSION,
      participantId: pid || "",
      anonId: null,                       // the researcher-issued ID typed on the first screen
      config: { ...Config.CONFIG },
      steps: { ...Config.STEPS },         // snapshotted, so a run stays interpretable later
      interactions: Config.INTERACTIONS.slice(),
      taskSet: null,                      // placeholder | fixed | prio (see setTasks)
      taskLang: null,
      taskSource: null,                   // "config" | "dev" (picked in the dev bar)
      startedAt: new Date().toISOString(),
      currentStep: 0,
      surveys: {},
      results: [],
      events: [],
      completed: false,
    };
    save();
    return data;
  }

  function get() { return data; }
  function setStep(i) { if (data) { data.currentStep = i; save(); } }
  function setAnonId(v) { if (data) { data.anonId = v || null; save(); } }
  function anonId() { return data ? data.anonId : null; }
  function setTasks(set, lang, source) {
    if (!data) return;
    data.taskSet = set; data.taskLang = lang; data.taskSource = source || data.taskSource;
    save();
  }

  /* ── the logging API (not called anywhere yet) ── */
  function log(type, payload) {
    if (!data || !logging()) return;
    data.events.push(Object.assign(
      { type, ts: Date.now(), tRel: Math.round(performance.now() - perfStart) },
      payload || {}
    ));
    save();
  }
  function addResult(r) { if (data && logging()) { data.results.push(r); save(); } }
  function setSurvey(id, answers) { if (data && logging()) { data.surveys[id] = answers; save(); } }
  function markComplete() { if (data) { data.completed = true; save(); } }

  /* ── localStorage ── */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.warn("autosave failed:", e); }
  }
  function load() {
    try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  }

  /* ── archive ── newest first, capped, trimmed further if the browser refuses */
  function readArchive() {
    try { const a = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function writeArchive(list) {
    let keep = list.slice(0, ARCHIVE_MAX);
    for (;;) {
      try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(keep)); return keep.length; }
      catch (e) {
        if (!keep.length) { try { localStorage.removeItem(ARCHIVE_KEY); } catch (e2) {} return 0; }
        keep = keep.slice(0, keep.length - 1);
      }
    }
  }
  function archiveCurrent(why) {
    const prev = load();
    if (!prev || !prev.participantId) return false;
    const list = readArchive().filter(s => s.participantId !== prev.participantId);
    list.unshift({ ...prev, archivedAt: new Date().toISOString(), archivedBecause: why });
    return writeArchive(list) > 0;
  }
  const archive = () => readArchive();

  // Re-POST archived sessions the collector never acknowledged.
  async function flushArchive() {
    const url = Config.ENDPOINT_URL;
    if (!url || !logging()) return 0;
    const list = readArchive();
    let sent = 0;
    for (const sess of list.filter(s => !s.collectedAt)) {
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                                       body: JSON.stringify(sess) });
        if (!res.ok) continue;
        sess.collectedAt = new Date().toISOString();
        sent++;
      } catch (e) { /* still offline; leave it for next time */ }
    }
    if (sent) writeArchive(list);
    return sent;
  }

  /* ── collector ── every POST carries the whole session, so a failed sync
     is healed by the next one. */
  const exportJSON = () => JSON.stringify(data, null, 2);

  async function sendRemote() {
    const url = Config.ENDPOINT_URL;
    if (!url || !data || !logging()) return false;
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                                     body: exportJSON() });
      if (!res.ok) throw new Error("HTTP " + res.status);
      data.collectedAt = new Date().toISOString();
      save();
      return true;
    } catch (e) {
      console.warn("[BDR] sync failed:", e);
      return false;
    }
  }

  function flush() {
    const url = Config.ENDPOINT_URL;
    if (!url || !data || !logging() || !navigator.sendBeacon) return false;
    try { return navigator.sendBeacon(url, new Blob([exportJSON()], { type: "application/json" })); }
    catch (e) { return false; }
  }

  // Console affordances: Store.download(), Store.archive().
  function download() {
    if (!data) return;
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([exportJSON()], { type: "application/json" })),
      download: `aiuse_${data.participantId || "anon"}_${Date.now()}.json`,
    });
    a.click();
  }

  return {
    SCHEMA_VERSION,
    newSession, get, setStep, setAnonId, anonId, setTasks,
    log, addResult, setSurvey, markComplete,
    load, download, sendRemote, flush, archive, flushArchive,
  };
})();
