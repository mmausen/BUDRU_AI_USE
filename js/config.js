/* ═══════════════════════════════════════════════════════════════════
   CONFIG — study settings: which steps run, which AI interactions run and
   in what order, the logging switches and the dev controls.

   A lighter successor of the designing-trust prototype: no AI characters,
   no counterbalanced groups (G1, G2 …). Every participant runs the same
   six interactions in the same order.
   ═══════════════════════════════════════════════════════════════════ */
window.Config = (function () {
  const CONFIG = {
    devMode: false,                // bottom-right dev bar: "Skip ▸", a jump-to-step picker
                                   //   and the interaction tuning controls in each task footer.
                                   //   Prototyping aid only — MUST be false for real participants.
    fileLogging: false,            // SAVE LOG FILES on the machine running server.js (npm start).
                                   //   true → each participant gets a folder
                                   //   <YYYY-MM-DD_HH-MM-SS>_<ID>/session.json in the log directory
                                   //   in the project's logs/ folder (git-ignored) once their ID is entered.
                                   //   false → nothing is sent; the session only autosaves to
                                   //   localStorage. See README "Logging".
  };

  /* ═══ which steps the session runs ════════════════════════════════
     Every non-task step can be switched off. Order when all are on:

       anonId → pre → [AI 1 → mid] … [AI 6 → mid] → end

     The AI interactions themselves are switched in INTERACTIONS below. */
  const STEPS = {
    anonId:      true,   // ask for the participant ID the research team issued
    preSurvey:   true,   // baseline questionnaire (7 ratings) before the first interaction
    midSurvey:   true,   // questionnaire (6 ratings) after EVERY interaction
  };

  /* ═══ the AI interactions ═════════════════════════════════════════
     An ARRAY of the interactions that run. Remove an entry (or comment it
     out) to drop that interaction from the run. Keys must match a module
     registered in js/interactions/*.js. Its order is the running order
     unless RANDOM_INTERACTION_ORDER shuffles it. */
  const INTERACTIONS = [
    "hint",       // 1 — picked-up card: the AI highlights its suggested slot
    "magnet",     // 2 — the dragged card is magnetically pulled to the AI's slot
    // "radial",  // 3 — hover a card: two slot options (one is a decoy) — DISABLED
    "heatmap",    // 4 — hover a card: hot→cold probability over every slot
    "handoff",    // 5 — cursor in the take-over zone: the AI takes the cursor and sorts
    "override",   // 6 — sort everything yourself, then the AI overrides you
  ];

  /* The order the interactions run in.
       false — the order of INTERACTIONS above (same for everyone)
       true  — a fresh random order per participant (session). The order is
               stored in the session as `interactions` (and the log's
               interactionOrderRandom flag); results, interaction times and
               mid-questionnaires (mid_<n>_<key>) all carry the interaction key. */
  const RANDOM_INTERACTION_ORDER = false;

  /* ═══ the tasks ═══════════════════════════════════════════════════
     Which task set every interaction draws its task from (tasks/<set>.json):
       "placeholder" — items A–F (the bdr-prototype labs), one task reused
       "fixed"       — process sequences with ONE correct order (6 tasks)
       "prio"        — prioritisation with a preferred order that leaves
                       room for interpretation (6 tasks)
     The AI recommends each task's `target-order`; the heatmap shows each
     tile's `heat` row. In devMode the dev bar's picker overrides the set. */
  const TASK_SET = "prio";

  /* ═══ language ════════════════════════════════════════════════════
     One language for everything: interface text, questionnaires and task
     content (strings.json and tasks/*.json carry "en" and "de").
       default  — the language a new participant starts in
       switcher — show the EN / DE switch (top right, on every screen).
                  A participant's choice is remembered in their browser. */
  const LANG = {
    default: "de",
    switcher: true,
  };

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
    enabled: false,                // hidden for now: no chips, no intro sentence
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

  return { CONFIG, STEPS, INTERACTIONS, RANDOM_INTERACTION_ORDER, TASK_SET, LANG, RANDOM_TASK_ASSIGNMENT, THOUGHTS,
           OVERRIDE, ENDPOINT_URL };
})();
