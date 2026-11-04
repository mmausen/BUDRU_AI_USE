/* ═══════════════════════════════════════════════════════════════════
   MAIN — boot: load the interface text, create the session, wire the
   screens and the dev bar, then enter the flow.
   ═══════════════════════════════════════════════════════════════════ */

// A fresh task-to-interaction assignment for this session (see Config.RANDOM_TASK_ASSIGNMENT).
// Used at session start and by the dev bar when the task set changes.
function assignTasks() {
  const list = Store.interactions();
  const order = Tasks.assign(list.length);
  Store.setTaskOrder(order);
  console.log("[BDR] interaction order / tasks: " + list.map((k, i) => `${k}→${order[i]}`).join(", "));
}

/* ── DEV BAR ─────────────────────────────────────────────────────────
   Shown only with Config.CONFIG.devMode. Lets a researcher skip parts of
   the run while building or piloting it:
     Skip ▸     — the next step, from wherever you are (also mid-task)
     Jump to    — any step directly: an interaction, a questionnaire, the end
     Tasks      — the task set (placeholder / fixed / prio); a running task is
                  rebuilt with the new one. Remembered in this browser across
                  reloads. (The language is the participant-facing EN / DE
                  switch, not part of the dev bar.)
     Restart    — a fresh session from the first step
     Params     — shows / hides the running interaction's tuning controls
                  (magnet strength and radius, handoff speed, …) in a panel
                  under the bar. Remembered in this browser. Greyed out when
                  the current step has none.
   Shortcut: Shift + → is Skip. */
window.Dev = (function () {
  const $ = id => document.getElementById(id);

  function fill() {
    const sel = $("dev-jump");
    sel.innerHTML = "";
    Flow.all().forEach((s, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `${i + 1}. ${s.label}`;
      sel.appendChild(opt);
    });
  }
  function sync(i) { const sel = $("dev-jump"); if (sel) sel.value = i; }

  function fillTasks() {
    const sel = $("dev-taskset");
    sel.innerHTML = "";
    Tasks.SETS.filter(Tasks.has).forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = "Tasks: " + name;
      sel.appendChild(opt);
    });
    sel.value = Tasks.set();
  }
  // Switch the task set; rebuild the task on screen so it shows at once.
  function setTasks(set) {
    const before = Tasks.set();
    Tasks.choose(set);
    Store.setTasks(Tasks.set(), "dev");
    if (Tasks.set() !== before) assignTasks();   // the old ids belong to the old set
    const cur = Flow.current();
    if (cur && cur.type === "task") Flow.go(Flow.index());
  }

  /* ── Params panel: Board.create() mounts an interaction's `tune` html here ── */
  const PARAMS_KEY = "bdr_aiuse_dev_params";
  let paramsOpen = true;
  try { paramsOpen = localStorage.getItem(PARAMS_KEY) !== "closed"; } catch (e) { /* default: open */ }
  function showParams() {
    const has = !!$("dev-tune").querySelector(".t-tune");
    $("dev-params").disabled = !has;
    $("dev-params").classList.toggle("on", has && paramsOpen);
    $("dev-tune").hidden = !(has && paramsOpen);
  }
  function mountTune(key, html) {
    const panel = $("dev-tune");
    panel.innerHTML = '<div class="dev-tune-hd"></div><div class="t-tune"></div>';
    panel.querySelector(".dev-tune-hd").textContent = key + " · parameters";
    const el = panel.querySelector(".t-tune");
    el.innerHTML = html;
    showParams();
    return el;
  }
  function unmountTune(el) {
    if (el && el.isConnected) $("dev-tune").innerHTML = "";
    showParams();
  }

  function wire(restart) {
    $("dev-bar").hidden = false;
    fill();
    fillTasks();
    $("dev-taskset").addEventListener("change", e => setTasks(e.target.value));
    $("dev-skip").addEventListener("click", () => Flow.next());
    $("dev-jump").addEventListener("change", e => Flow.go(+e.target.value));
    $("dev-restart").addEventListener("click", restart);
    $("dev-params").addEventListener("click", () => {
      paramsOpen = !paramsOpen;
      try { localStorage.setItem(PARAMS_KEY, paramsOpen ? "open" : "closed"); } catch (e) { /* ignore */ }
      showParams();
    });
    showParams();
    document.addEventListener("keydown", e => {
      if (e.shiftKey && e.key === "ArrowRight") { e.preventDefault(); Flow.next(); }
    });
  }

  return { wire, sync, mountTune, unmountTune };
})();

(function () {
  const $ = id => document.getElementById(id);

  // Auto participant ID: 4 random letters + base36 timestamp. Names the log folder.
  function genParticipantId() {
    let letters = "";
    for (let i = 0; i < 4; i++) letters += String.fromCharCode(65 + Math.floor(Math.random() * 26));
    return letters + "-" + Date.now().toString(36);
  }

  function applyStaticText() {
    document.querySelectorAll("[data-s]").forEach(el => { el.textContent = S.t(el.getAttribute("data-s")); });
    $("anon-id-input").placeholder = S.t("ui.anonId.placeholder");
    document.documentElement.lang = S.lang();
  }

  /* ── language: one choice for interface, questionnaires and tasks ──
     Starts at Config.LANG.default, or the participant's last pick in this
     browser. The EN / DE switch (Config.LANG.switcher) works on every screen:
     static text and a questionnaire are relabelled in place (answers kept);
     a running task is rebuilt in the new language. */
  const LANG_KEY = "bdr_aiuse_lang";
  function initLang() {
    let saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch (e) { /* default */ }
    applyLang(S.LANGS.includes(saved) ? saved : Config.LANG.default);
  }
  function applyLang(l) {
    S.setLang(l);
    Tasks.setLang(l);
    applyStaticText();
    document.querySelectorAll("#lang-switch [data-lang]").forEach(b => {
      b.classList.toggle("on", b.dataset.lang === l);
      b.setAttribute("aria-pressed", b.dataset.lang === l);
    });
  }
  function switchLang(l) {
    if (l === S.lang()) return;
    try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* ignore */ }
    applyLang(l);
    Store.setLang(l, true);
    const cur = Flow.current();
    if (!cur) return;
    if (cur.type === "survey") Screens.relabel();
    else if (cur.type === "task") Flow.go(Flow.index());
  }
  function wireLang() {
    const el = $("lang-switch");
    if (!Config.LANG.switcher) return;
    el.hidden = false;
    document.body.classList.add("has-lang");
    el.addEventListener("click", e => {
      const b = e.target.closest("[data-lang]");
      if (b) switchLang(b.dataset.lang);
    });
  }

  function startSession() {
    Store.newSession(genParticipantId());
    Store.setTasks(Tasks.set(), Tasks.set() === Config.TASK_SET ? "config" : "dev");
    Store.setLang(S.lang());
    assignTasks();
    Flow.build();
    Flow.go(0);
  }

  /* The AI is embodied as a cursor in most interactions, so a device without
     a precise pointer cannot run this study. Gate on input capability, not
     screen width, so a desktop user with a small window is never blocked. */
  function isUnsupportedDevice() {
    if (!window.matchMedia) return false;
    return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches;
  }

  function boot() {
    if (!Config.CONFIG.fileLogging) {
      console.warn("[BDR] file logging is OFF (Config.CONFIG.fileLogging = false) — no log files are written.");
    }
    Tasks.init();
    initLang();
    console.log(`[BDR] task set "${Tasks.set()}", language ${S.lang()}`);
    Config.INTERACTIONS.forEach(k => {
      if (!Interactions.get(k)) console.error(`[BDR] Config.INTERACTIONS names "${k}", but no module registered it.`);
    });
    Store.flushArchive().then(n => { if (n) console.log(`[BDR] uploaded ${n} archived session(s)`); });

    wireLang();
    Screens.wire();
    Task.wire();

    window.addEventListener("pagehide", () => Store.flush());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") Store.flush(); });

    if (isUnsupportedDevice()) { Flow.showScreen("screen-mobile"); return; }

    startSession();
    if (Config.CONFIG.devMode) Dev.wire(() => { Task.stop(); startSession(); });
  }

  // Load the interface text and the three task sets, then boot.
  // (fetch needs http — serve with `npm start`, not file://.)
  document.addEventListener("DOMContentLoaded", () => {
    const grab = url => fetch(url, { cache: "no-cache" }).then(r => {
      if (!r.ok) throw new Error(url + " → HTTP " + r.status);
      return r.json();
    });
    const loads = [
      grab("strings.json").then(S.load).catch(err => { console.error("Failed to load strings.json:", err); S.load({}); }),
      ...Tasks.SETS.map(name => grab(`tasks/${name}.json`).then(json => Tasks.load(name, json))
        .catch(err => console.error(`Failed to load tasks/${name}.json:`, err))),
    ];
    Promise.all(loads).finally(boot);
  });
})();
