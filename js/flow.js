/* ═══════════════════════════════════════════════════════════════════
   FLOW — the step machine. One linear sequence:

     anonId → pre → [AI 1 → mid] → [AI 2 → mid] … [AI 6 → mid] → end

   Optional steps are switched in Config.STEPS; which interactions run, and
   in what order, is Config.INTERACTIONS. build() leaves the disabled ones
   out. A task advances the flow itself (Task calls Flow.next() on confirm).
   ═══════════════════════════════════════════════════════════════════ */
window.Flow = (function () {
  let steps = [];
  let i = 0;

  function build() {
    const S = Config.STEPS;
    const list = Config.INTERACTIONS;
    steps = [];

    if (S.anonId) steps.push({ type: "anonId", label: "Participant ID" });
    if (S.preSurvey) steps.push({ type: "survey", id: "pre", label: "Pre-questionnaire" });

    list.forEach((key, idx) => {
      const n = idx + 1;
      steps.push({ type: "task", interaction: key, n, total: list.length,
                   label: `AI ${n} · ${key}` });
      // Every mid-survey shares the one placeholder (surveys.mid) but is
      // stored under its own id, so answers per interaction stay apart.
      if (S.midSurvey) steps.push({ type: "survey", id: "mid", storeAs: `mid_${n}_${key}`,
                                    after: key, label: `Mid-questionnaire ${n}` });
    });

    steps.push({ type: "end", label: "Thank you" });
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => { s.hidden = (s.id !== id); });
  }

  function render() {
    const step = steps[i];
    if (!step) return;
    Store.setStep(i);
    if (window.Dev) Dev.sync(i);
    switch (step.type) {
      case "anonId": Screens.anonId(); break;
      case "survey": Screens.survey(step); break;
      case "task":   Task.start(step); break;
      case "end":    Screens.end(); break;
    }
  }

  function go(n) {
    if (n < 0 || n >= steps.length) return;
    Task.stop();                // never leave an interaction running underneath
    i = n;
    render();
  }
  function next() { go(i + 1); }
  function current() { return steps[i] || null; }
  function index() { return i; }
  function all() { return steps.slice(); }

  return { build, go, next, current, index, all, showScreen };
})();
