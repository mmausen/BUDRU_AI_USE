/* ═══════════════════════════════════════════════════════════════════
   TASK — hosts one AI interaction as a flow step.

   Mounts the interaction's module (js/interactions/<key>.js) into the task
   screen, opens its intro card on top (the ⓘ button in the banner reopens
   it), and advances the flow when the participant confirms a ranking.
   stop() tears the interaction down completely — listeners, rAF loops and
   timers included — which is what makes dev Skip / jump safe mid-task.

   Records each interaction's start (Start pressed on the intro card) and
   end (ranking confirmed) via Store.interactionStart / interactionEnd, sets
   the logging context every board event is stamped with, and on Confirm
   stores the result: the final ranking against the AI's, plus the board's
   counters (b.stats).
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
    const task = Tasks.forRound(s.n);
    Store.setContext({ n: s.n, interaction: s.interaction, taskId: task ? task.id : null });
    board = mod.mount($("task-host"), {
      task,
      onConfirm: confirm,
      // Paused while the intro card is open or an AI thought is being read.
      paused: () => explainerOpen || !!(board && board.thoughtOpen),
    });
    const info = board.$(".t-info");
    if (info) info.addEventListener("click", openExplainer);
    openExplainer();
  }

  function stop() {
    if (board) { board.destroy(); board = null; }
    Store.setContext(null);
    closeExplainer();
    $("task-host").innerHTML = "";
  }

  /* ── intro card ── */
  function openExplainer() {
    if (!step) return;
    $("explainer-title").textContent = S.t(`interactions.${step.interaction}.title`);
    $("explainer-body").textContent = S.t(`interactions.${step.interaction}.intro`) +
      (Config.THOUGHTS.enabled ? " " + S.t("ui.task.thoughtIntro") : "");
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
    Store.interactionEnd(step);
    Store.addResult(result());
    Store.sendRemote();
    Flow.next();
  }

  /* The confirmed ranking against the AI's (tile keys, top → bottom):
       exactMatches  — tiles in the very slot the AI ranks them
       rankDistance  — Σ |participant slot − AI slot| over all tiles (0 = identical, 18 = reversed)
     plus who placed what (b.stats) and the interaction's own AI counters (stats.ai). */
  function result() {
    const key = id => board.keyOf(id);
    const ranking = board.slots.slice(), ai = board.aiRanking;
    const st = board.stats;
    return {
      n: step.n, interaction: step.interaction, taskId: board.task.id,
      thoughtsVisible: !!Config.THOUGHTS.enabled,
      ranking: ranking.map(key),
      aiRanking: ai.map(key),
      exactMatches: ranking.filter((id, i) => id === ai[i]).length,
      rankDistance: ranking.reduce((sum, id, i) => sum + Math.abs(i - ai.indexOf(id)), 0),
      pickups: st.pickups,
      placedByParticipant: st.placedByParticipant,
      placedByAi: st.placedByAi,
      participantOnAiSlot: st.participantOnAiSlot,
      returnsToInbox: st.returnsToInbox,
      thoughtsRead: st.thoughtsRead,
      ai: board.aiSummary ? board.aiSummary() : st.ai,
    };
  }

  function wire() {
    $("explainer-ok").addEventListener("click", () => {
      closeExplainer();
      if (step && board) {                       // the interaction starts now (kept on later reopenings)
        const task = Tasks.forRound(step.n);
        Store.interactionStart(step, task ? task.id : null);
        Store.sendRemote();
      }
    });
  }

  return { start, stop, wire };
})();
