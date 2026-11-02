/* ═══════════════════════════════════════════════════════════════════
   SCREENS — everything that is not a task: the participant-ID step, the
   placeholder questionnaires (pre / mid / final) and the thank-you page.

   Survey answers are validated but NOT stored yet (no data logging) — the
   hook is the commented Store.setSurvey call in submitSurvey().
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
    const def = S.block("surveys." + step.id) || { questions: [] };
    Flow.showScreen("screen-survey");
    $("survey-kicker").textContent = def.kicker || "";
    $("survey-title").textContent = def.title || "";
    $("survey-note").textContent = "";
    const form = $("survey-form");
    form.innerHTML = "";
    (def.questions || []).forEach(q => form.appendChild(field(q)));
    $("screen-survey").scrollTop = 0;
  }

  function field(q) {
    const wrap = document.createElement("div");
    wrap.className = "q";
    const lbl = document.createElement("div");
    lbl.className = "q-label";
    lbl.textContent = q.label + (q.required ? " *" : "");
    wrap.appendChild(lbl);

    if (q.type === "likert") {
      const row = document.createElement("div");
      row.className = "likert";
      for (let n = 1; n <= 5; n++) {
        const opt = document.createElement("label");
        opt.className = "likert-opt";
        opt.innerHTML = `<input type="radio" name="${q.id}" value="${n}"/><span>${n}</span>`;
        row.appendChild(opt);
      }
      wrap.appendChild(row);
      const anc = document.createElement("div");
      anc.className = "likert-anchors";
      anc.innerHTML = "<span></span><span></span>";
      anc.children[0].textContent = S.t("ui.survey.likertLow");
      anc.children[1].textContent = S.t("ui.survey.likertHigh");
      wrap.appendChild(anc);
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
    // Not stored yet. When the questionnaires are final:
    //   Store.setSurvey(survey.storeAs || survey.id, collect().out);
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

  return { wire, anonId, survey: surveyScreen, end };
})();
