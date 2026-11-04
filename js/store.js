/* ═══════════════════════════════════════════════════════════════════
   STORE — single source of truth for the session, and the logging
   pipeline. Carried over from the designing-trust prototype, trimmed:

   - Holds one `data` object (participant, steps, surveys, results, events).
   - Autosaves to localStorage after every mutation (crash/refresh safety).
   - A session being replaced is archived first, so a second run in the same
     browser can never silently destroy the first.
   - sendRemote() POSTs the COMPLETE session to the collector (server.js) at
     step boundaries; flush() is the sendBeacon last-gasp on tab close. Only
     with Config.CONFIG.fileLogging — the server writes it to files.

   What a session records (see README "Logging"):
     anonId, date, startTime, startedAt   — who, and when the session began
     logFolder                            — <timestamp>_<ID>, set when the ID is entered
     surveys[<step>] = { answers, submittedAt }   — every questionnaire
     interactionTimes[] = { n, interaction, taskId, startedAt, endedAt, durationMs,
                            firstMoveAt, firstPlacementAt, msToFirstMove, msFirstPlacementToConfirm }
       startedAt = Start pressed on the intro card, endedAt = ranking confirmed;
       the questionnaires are separate steps, so they are never inside it.
     results[]  — per interaction, on Confirm: final ranking vs the AI's, counts (see Task.confirm)
     events[]   — every pick-up, placement, thought read and AI event, tagged
                  with the running interaction (setContext) — also events.jsonl
     thoughtsVisible — whether the AI thought chips were shown at all
   Times are local ISO strings with the UTC offset (2026-11-04T10:21:33.120+01:00).
   Slots in results and events are 1-based (1 = top); cards are tile keys.
   ═══════════════════════════════════════════════════════════════════ */
window.Store = (function () {
  const KEY = "bdr_aiuse_session";
  const ARCHIVE_KEY = "bdr_aiuse_archive";
  const ARCHIVE_MAX = 10;
  const SCHEMA_VERSION = 1;
  const perfStart = performance.now();
  let data = null;

  // Master switch (Config.CONFIG.fileLogging). Off → nothing is POSTed, so no files are written.
  const logging = () => Config.CONFIG.fileLogging === true;

  // Local time as ISO 8601 with the UTC offset, e.g. 2026-11-04T10:21:33.120+01:00.
  const pad = (n, w) => String(n).padStart(w || 2, "0");
  function localIso(d) {
    d = d || new Date();
    const off = -d.getTimezoneOffset(), sign = off >= 0 ? "+" : "-", a = Math.abs(off);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
           `.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
  }
  // <YYYY-MM-DD_HH-MM-SS>_<id>: the participant's log folder (the server sanitises it again).
  function folderName(id, d) {
    d = d || new Date();
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return stamp + "_" + (String(id).replace(/[^A-Za-z0-9_-]/g, "") || "noid");
  }

  function newSession(pid) {
    archiveCurrent("replaced by a new session");
    const now = new Date();
    const started = localIso(now);
    data = {
      schemaVersion: SCHEMA_VERSION,
      participantId: pid || "",           // auto-generated session key (not the typed ID)
      anonId: null,                       // the researcher-issued ID typed on the first screen
      date: started.slice(0, 10),         // local date the session started
      startTime: started.slice(11, 19),   // local time the session started
      startedAt: started,
      idEnteredAt: null,
      // Without an ID step the folder is named after the session key from the start.
      logFolder: Config.STEPS.anonId ? null : folderName(pid, now),
      config: { ...Config.CONFIG },
      steps: { ...Config.STEPS },         // snapshotted, so a run stays interpretable later
      interactions: Config.INTERACTIONS.slice(),
      taskSet: null,                      // placeholder | fixed | prio (see setTasks)
      taskSource: null,                   // "config" | "dev" (picked in the dev bar)
      lang: null,                         // "en" | "de" — interface, questionnaires and tasks
      langChanges: [],                    // { lang, step, at } each time the participant switched
      thoughtsVisible: !!Config.THOUGHTS.enabled,   // AI thought chips shown on the cards?
      taskOrder: [],                      // task id per interaction, in interaction order
      currentStep: 0,
      surveys: {},
      interactionTimes: [],
      results: [],
      events: [],
      completed: false,
    };
    save();
    return data;
  }

  function get() { return data; }
  function setStep(i) { if (data) { data.currentStep = i; save(); } }
  // The typed ID also fixes the log folder: <timestamp of entry>_<ID>. Set once per session.
  function setAnonId(v) {
    if (!data) return;
    data.anonId = v || null;
    if (v && !data.logFolder) {
      const now = new Date();
      data.idEnteredAt = localIso(now);
      data.logFolder = folderName(v, now);
    }
    save();
  }
  function anonId() { return data ? data.anonId : null; }
  function setTasks(set, source) {
    if (!data) return;
    data.taskSet = set; data.taskSource = source || data.taskSource;
    save();
  }
  // `switched` → the participant changed it (recorded with the step it happened on).
  function setLang(lang, switched) {
    if (!data) return;
    if (switched && lang !== data.lang) data.langChanges.push({ lang, step: data.currentStep, at: new Date().toISOString() });
    data.lang = lang;
    save();
  }
  function setTaskOrder(ids) { if (data) { data.taskOrder = ids.slice(); save(); } }

  /* ── context ── the interaction now running; stamped on every event */
  let context = null;
  function setContext(c) { context = c || null; }

  /* ── AI interaction times ── one entry per interaction (n). A task rebuilt
     mid-run (language switch, ⓘ reopened) keeps its first start. */
  function interactionStart(step, taskId) {
    if (!data) return;
    let r = data.interactionTimes.find(x => x.n === step.n);
    if (r && !r.endedAt) return;                      // already running
    if (r) data.interactionTimes.splice(data.interactionTimes.indexOf(r), 1);   // dev: run again
    data.interactionTimes.push({ n: step.n, interaction: step.interaction, taskId: taskId || null,
                                 startedAt: localIso(), endedAt: null, durationMs: null,
                                 firstMoveAt: null, firstPlacementAt: null,
                                 msToFirstMove: null, msFirstPlacementToConfirm: null });
    data.interactionTimes.sort((a, b) => a.n - b.n);
    save();
  }
  function interactionEnd(step) {
    if (!data) return;
    const r = data.interactionTimes.find(x => x.n === step.n);
    if (!r || r.endedAt) return;
    const now = new Date();
    r.endedAt = localIso(now);
    r.durationMs = now - Date.parse(r.startedAt);
    if (r.firstPlacementAt) r.msFirstPlacementToConfirm = now - Date.parse(r.firstPlacementAt);
    save();
  }
  // The participant's first pick-up ("firstMoveAt") / the first card placed by anyone
  // ("firstPlacementAt") in the running interaction. Only the first one counts.
  function markFirst(field) {
    if (!data || !context) return;
    const r = data.interactionTimes.find(x => x.n === context.n);
    if (!r || r.endedAt || r[field]) return;
    const now = new Date();
    r[field] = localIso(now);
    if (field === "firstMoveAt") r.msToFirstMove = now - Date.parse(r.startedAt);
    save();
  }

  /* ── the logging API ── */
  function log(type, payload) {
    if (!data || !logging()) return;
    data.events.push(Object.assign(
      { type, at: localIso(), ts: Date.now(), tRel: Math.round(performance.now() - perfStart) },
      context || {},
      payload || {}
    ));
    save();
  }
  function addResult(r) { if (data && logging()) { data.results.push(r); save(); } }
  function setSurvey(id, answers) {
    if (data) { data.surveys[id] = { answers, submittedAt: localIso() }; save(); }
  }
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
    newSession, get, setStep, setAnonId, anonId, setTasks, setLang, setTaskOrder,
    setContext, interactionStart, interactionEnd, markFirst, log, addResult, setSurvey, markComplete,
    load, download, sendRemote, flush, archive, flushArchive,
  };
})();
