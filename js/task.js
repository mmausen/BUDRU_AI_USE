/* ═══════════════════════════════════════════════════════════════════
   TASK — hosts one AI interaction as a flow step.

   Mounts the interaction's module (js/interactions/<key>.js) into the task
   screen, opens its intro card on top (the ⓘ button in the banner reopens
   it), and advances the flow when the participant confirms a ranking.
   stop() tears the interaction down completely — listeners, rAF loops and
   timers included — which is what makes dev Skip / jump safe mid-task.

   Results are NOT recorded yet (no data logging). The hook is the
   commented Store.addResult call in confirm().
   ═══════════════════════════════════════════════════════════════════ */
window.Task = (function () {
  const $ = id => document.getElementById(id);
  let board = null;
  let step = null;
  let explainerOpen = false;

  function start(s) {
    stop();
    step = s;
    const mod = Interactions.get(s.interaction);
    Flow.showScreen("screen-task");
    $("task-progress").textContent = S.t("ui.task.progress", { n: s.n, total: s.total });
    if (!mod) {
      $("task-host").innerHTML = "";
      console.error(`[BDR] no interaction module "${s.interaction}" — check Config.INTERACTIONS`);
      return;
    }
    board = mod.mount($("task-host"), {
      task: Tasks.forRound(s.n),
      onConfirm: confirm,
      paused: () => explainerOpen,
    });
    const info = board.$(".t-info");
    if (info) info.addEventListener("click", openExplainer);
    openExplainer();
  }

  function stop() {
    if (board) { board.destroy(); board = null; }
    closeExplainer();
    $("task-host").innerHTML = "";
  }

  /* ── intro card ── */
  function openExplainer() {
    if (!step) return;
    $("explainer-title").textContent = S.t(`interactions.${step.interaction}.title`);
    $("explainer-body").textContent = S.t(`interactions.${step.interaction}.intro`);
    $("explainer-ok").textContent = S.t("ui.task.start");
    $("explainer").hidden = false;
    $("screen-task").classList.add("paused");
    explainerOpen = true;
    $("explainer-ok").focus();
  }
  function closeExplainer() {
    $("explainer").hidden = true;
    $("screen-task").classList.remove("paused");
    explainerOpen = false;
  }

  function confirm() {
    // Not stored yet. When the measures are decided:
    //   Store.addResult({ interaction: step.interaction, n: step.n, ranking: board.slots.slice(), … });
    Store.sendRemote();
    Flow.next();
  }

  function wire() {
    $("explainer-ok").addEventListener("click", closeExplainer);
  }

  return { start, stop, wire };
})();
