/* ═══════════════════════════════════════════════════════════════════
   CONFIG — study settings: which steps run, which AI interactions run and
   in what order, the logging switches and the dev controls.

   A lighter successor of the designing-trust prototype: no AI characters,
   no counterbalanced groups (G1, G2 …). Every participant runs the same
   six interactions in the same order.
   ═══════════════════════════════════════════════════════════════════ */
window.Config = (function () {
  const CONFIG = {
    devMode: true,                 // bottom-right dev bar: "Skip ▸", a jump-to-step picker
                                   //   and the interaction tuning controls in each task footer.
                                   //   Prototyping aid only — MUST be false for real participants.
    loggingEnabled: false,         // MASTER SWITCH for the logging pipeline. false → Store.log
                                   //   records nothing and nothing is POSTed. The session still
                                   //   autosaves to localStorage. No study events are emitted
                                   //   yet anyway — see README "Logging".
  };

  /* ═══ which steps the session runs ════════════════════════════════
     Every non-task step can be switched off. Order when all are on:

       anonId → pre → [AI 1 → mid] … [AI 6 → mid] → final → end

     The AI interactions themselves are switched in INTERACTIONS below. */
  const STEPS = {
    anonId:      true,   // ask for the participant ID the research team issued
    preSurvey:   true,   // placeholder questionnaire before the first interaction
    midSurvey:   true,   // placeholder questionnaire after EVERY interaction
    finalSurvey: true,   // placeholder final screener after the last mid-survey
  };

  /* ═══ the AI interactions ═════════════════════════════════════════
     An ARRAY: its order IS the running order. Remove an entry (or comment
     it out) to drop that interaction from the run. Keys must match a module
     registered in js/interactions/*.js. */
  const INTERACTIONS = [
    "hint",       // 1 — picked-up card: the AI highlights its suggested slot
    "magnet",     // 2 — the dragged card is magnetically pulled to the AI's slot
    "radial",     // 3 — hover a card: two slot options (one is a decoy)
    "heatmap",    // 4 — hover a card: hot→cold probability over every slot
    "handoff",    // 5 — stop moving and the AI takes the cursor and finishes
    "override",   // 6 — sort everything yourself, then the AI overrides you
  ];

  /* ═══ the tasks ═══════════════════════════════════════════════════
     Which task set every interaction draws its task from (tasks/<set>.json):
       "placeholder" — items A–F (the bdr-prototype labs), one task reused
       "fixed"       — process sequences with ONE correct order (6 tasks)
       "prio"        — prioritisation with a preferred order that leaves
                       room for interpretation (6 tasks)
     The AI recommends each task's `target-order`; the heatmap shows each
     tile's `heat` row. In devMode the dev bar's picker overrides both settings. */
  const TASK_SET = "placeholder";
  const TASK_LANG = "en";          // task content language: "de" | "en"

  /* Which task each interaction gets.
       false — interaction n runs task n of the set (same for everyone)
       true  — a fresh random assignment per session: every interaction gets a
               different task (as long as the set has enough), so task
               difficulty no longer travels with one interaction.
     The assignment is stored in the session as `taskOrder` (task ids, in
     interaction order). The placeholder set has one task, so it changes nothing there. */
  const RANDOM_TASK_ASSIGNMENT = true;

  /* AI THOUGHTS — the AI's reasoning for each tile (the `thought` in tasks/*.json).
     When enabled, every card carries a small "AI" chip; hovering it opens a
     bubble with the thought. Same in all six interactions. Reading a thought
     pauses the handoff AI, so it never takes over while someone reads. */
  const THOUGHTS = {
    enabled: true,
    openDelayMs: 150,              // hover this long on the chip before the bubble opens
  };

  /* Interaction 6 — OVERRIDE. The AI always changes at least this many of the
     participant's tiles, even when the participant's order already matches
     the AI's ranking exactly (it then swaps a random adjacent pair). */
  const OVERRIDE = {
    minOverrides: 1,
    editAfterOverride: true,       // may the participant re-arrange after the AI is done?
  };

  // Where Store.sendRemote() posts the session. "" → localStorage only.
  const ENDPOINT_URL = "/collect-logs";

  return { CONFIG, STEPS, INTERACTIONS, TASK_SET, TASK_LANG, RANDOM_TASK_ASSIGNMENT, THOUGHTS,
           OVERRIDE, ENDPOINT_URL };
})();
