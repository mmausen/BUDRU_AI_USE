/* ═══════════════════════════════════════════════════════════════════
   SCREENS — everything that is not a task: the participant-ID step, the
   questionnaires (pre / mid) and the thank-you page.

   Questionnaires live in strings.json (surveys.<id>, per language). A
   "likert" item is a 1…`scale` rating (default 7) with end labels from its
   own `anchors` or, without them, ui.survey.likertLow / likertHigh. A mid
   questionnaire's kicker may name the interaction just used ({badge}).

   Survey answers are stored in the session under the step's storeAs
   (pre, mid_<n>_<interaction>) and written to the log folder.
   ═══════════════════════════════════════════════════════════════════ */
window.Screens = (function () {
  const $ = id => document.getElementById(id);
  let survey = null;   // the survey step on screen

  /* ── participant ID ── */
  function anonId() {
    Flow.showScreen("screen-anon-id");
    const input = $("anon-id-input");
    input.value = Store.anonId() || "";
    $("anon-id-error").hidden = true;
    input.focus();
  }
  function submitAnonId() {
    const value = ($("anon-id-input").value || "").trim();
    if (!value) {
      $("anon-id-error").textContent = S.t("ui.anonId.required");
      $("anon-id-error").hidden = false;
      return;
    }
    // Kept on the session as the link to the researchers' list. It never becomes
    // the participantId, which names the log folder (see README).
    Store.setAnonId(value);
    Store.sendRemote();
    Flow.next();
  }

  /* ── surveys ── */
  function surveyScreen(step) {
    survey = step;
    Flow.showScreen("screen-survey");
    renderSurvey();
    $("screen-survey").scrollTop = 0;
  }
  function renderSurvey(keep) {
    const def = S.block("surveys." + survey.id) || { questions: [] };
    const badge = survey.after ? S.t(`interactions.${survey.after}.badge`) : "";
    $("survey-kicker").textContent = S.fill(def.kicker || "", { badge });
    $("survey-title").textContent = def.title || "";
    $("survey-intro").textContent = def.intro || "";
    $("survey-intro").hidden = !def.intro;
    $("survey-note").textContent = "";
    const form = $("survey-form");
    form.innerHTML = "";
    (def.questions || []).forEach(q => form.appendChild(field(q)));
    if (keep) Object.keys(keep).forEach(id => {        // restore answers after a language switch
      const v = keep[id];
      if (v === null || v === "") return;
      const radio = form.querySelector(`input[name="${id}"][value="${v}"]`);
      if (radio) radio.checked = true;
      const ta = form.querySelector(`textarea[name="${id}"]`);
      if (ta) ta.value = v;
    });
  }
  // Language switched while a questionnaire is open: relabel it, keep the answers.
  function relabel() { if (survey) renderSurvey(collect().out); }

  function field(q) {
    const wrap = document.createElement("div");
    wrap.className = "q";
    const lbl = document.createElement("div");
    lbl.className = "q-label";
    lbl.textContent = q.label;   // no "*": every rating is required, Continue says so if one is missing
    wrap.appendChild(lbl);

    if (q.type === "likert") {
      const scale = document.createElement("div");
      scale.className = "likert-scale";
      const row = document.createElement("div");
      row.className = "likert";
      for (let n = 1; n <= (q.scale || 7); n++) {
        const opt = document.createElement("label");
        opt.className = "likert-opt";
        opt.innerHTML = `<input type="radio" name="${q.id}" value="${n}"/><span>${n}</span>`;
        row.appendChild(opt);
      }
      scale.appendChild(row);
      const anc = document.createElement("div");
      anc.className = "likert-anchors";
      anc.innerHTML = "<span></span><span></span>";
      const [lo, hi] = q.anchors || [S.t("ui.survey.likertLow"), S.t("ui.survey.likertHigh")];
      anc.children[0].textContent = lo;
      anc.children[1].textContent = hi;
      scale.appendChild(anc);
      wrap.appendChild(scale);
    } else {
      const ta = document.createElement("textarea");
      ta.name = q.id;
      ta.rows = 3;
      ta.className = "q-text";
      wrap.appendChild(ta);
    }
    return wrap;
  }

  function collect() {
    const def = S.block("surveys." + survey.id) || { questions: [] };
    const out = {};
    let ok = true;
    (def.questions || []).forEach(q => {
      let v;
      if (q.type === "likert") {
        const el = document.querySelector(`input[name="${q.id}"]:checked`);
        v = el ? +el.value : null;
      } else {
        const el = document.querySelector(`textarea[name="${q.id}"]`);
        v = el ? el.value.trim() : "";
      }
      if (q.required && (v === null || v === "")) ok = false;
      out[q.id] = v;
    });
    return { ok, out };
  }

  function submitSurvey() {
    const { ok } = collect();
    if (!ok) { $("survey-note").textContent = S.t("ui.survey.required"); return; }
    Store.setSurvey(survey.storeAs || survey.id, collect().out);
    Store.sendRemote();
    Flow.next();
  }

  /* ── thank-you / end ── terminal, no way forward */
  function end() {
    Store.markComplete();
    Store.sendRemote();
    Flow.showScreen("screen-end");
  }

  function wire() {
    $("btn-anon-id-next").addEventListener("click", submitAnonId);
    $("anon-id-input").addEventListener("input", () => { $("anon-id-error").hidden = true; });
    $("anon-id-input").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); submitAnonId(); }
    });
    $("btn-survey-next").addEventListener("click", submitSurvey);
  }

  return { wire, anonId, survey: surveyScreen, relabel, end };
})();
