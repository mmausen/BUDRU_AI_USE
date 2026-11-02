/* ═══════════════════════════════════════════════════════════════════
   BOARD — the sorting task every interaction shares: the task's six tiles
   (from Tasks — see js/tasks.js), the inbox, the six-slot ranking
   ladder, card elements, the drag ghost, hit-testing and the footer with
   Confirm. Everything the five labs duplicated lives here once; an
   interaction module only adds its own AI mechanic on top.

     const b = Board.create(container, {
       key:        "hint",              // interaction key → strings, accent colour
       task:       Tasks.forRound(n),   // tiles, labels, the AI's target order, heat
       drag:       true,                // default mouse drag (false → module drives its own)
       footerLeft: el | html,           // left side of the footer
       tune:       html,                // dev-only tuning controls (shown in devMode)
       bannerRight:html,                // e.g. the handoff "who's in control" pill
       slotDecor(slotEl, i), cardDecor(cardEl, card, from),
       onDragStart(d), onDragMove(d, e), onDragEnd(d),
       canConfirm(), onConfirm(),
     });

   Every global listener or timer a module needs goes through b.listen() /
   b.onDestroy(), so Task.stop() can tear an interaction down completely.
   ═══════════════════════════════════════════════════════════════════ */
window.Board = (function () {
  const DRAG_THRESHOLD = 5;   // px before a press becomes a drag

  const shuffle = a => {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = 0 | (Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  function create(container, opts) {
    opts = opts || {};
    const cleanups = [];
    const task = opts.task;
    const cards = shuffle(task.tiles.map(t => Object.assign({}, t)));
    const byId = {};
    cards.forEach(c => { byId[c.id] = c; });
    const aiRanking = task.aiRanking.slice();

    const b = {
      key: opts.key,
      task, byId, aiRanking,
      inbox: cards.slice(),
      slots: [null, null, null, null, null, null],
      drag: null,
      locked: false,           // true → the participant cannot pick anything up
    };

    /* ── markup ── */
    const root = document.createElement("div");
    root.className = "lab-task";
    root.dataset.ix = opts.key || "";
    root.innerHTML =
      '<div class="t-banner">' +
        '<span class="b-badge"></span>' +
        '<span class="t-hint"><b class="t-title"></b><span class="t-desc"></span></span>' +
        '<button type="button" class="t-info" title="">i</button>' +
        (opts.bannerRight || "") +
      '</div>' +
      '<div class="t-main">' +
        '<div class="t-col"><div class="t-col-hd t-inbox-hd"></div><div class="t-scroll t-inbox"></div></div>' +
        '<div class="t-col"><div class="t-col-hd"></div><div class="t-ladder"></div></div>' +
      '</div>' +
      '<div class="t-footer">' +
        '<div class="t-footer-left"></div>' +
        (Config.CONFIG.devMode && opts.tune ? '<div class="t-tune" title="Dev only — hidden when devMode is off">' + opts.tune + '</div>' : "") +
        '<button type="button" class="t-btn t-primary t-confirm" disabled></button>' +
      '</div>' +
      '<div class="t-ghost"><div class="card-icon"></div><div><div class="card-title"></div><div class="card-detail"></div></div></div>';
    container.appendChild(root);

    const q = sel => root.querySelector(sel);
    b.root = root;
    b.$ = q;
    b.$$ = sel => root.querySelectorAll(sel);

    q(".b-badge").textContent = S.t(`interactions.${opts.key}.badge`);
    const L = task.labels || {};
    q(".t-title").textContent = task.title;
    q(".t-desc").textContent = " — " + (L.brief || S.t("ui.task.brief"));
    q(".t-hint").title = task.description;
    q(".t-info").title = S.t("ui.task.info");
    q(".t-main .t-col + .t-col .t-col-hd").textContent = L.ladder || S.t("ui.task.ladder");
    const footerLeft = q(".t-footer-left");
    if (typeof opts.footerLeft === "string") footerLeft.innerHTML = opts.footerLeft;
    else if (opts.footerLeft) footerLeft.appendChild(opts.footerLeft);
    const confirmBtn = q(".t-confirm");
    confirmBtn.textContent = S.t("ui.task.confirm");
    confirmBtn.addEventListener("click", () => { if (!confirmBtn.disabled && opts.onConfirm) opts.onConfirm(); });

    const inboxEl = q(".t-inbox");
    const ladderEl = q(".t-ladder");
    const ghost = q(".t-ghost");
    const slotLabels = [L.first || S.t("ui.task.mostUrgent"), "", "", "", "", L.last || S.t("ui.task.leastUrgent")];

    /* ── render ── */
    function render() {
      inboxEl.innerHTML = "";
      if (!b.inbox.length) {
        const n = document.createElement("div");
        n.className = "t-empty";
        n.textContent = S.t("ui.task.allPlaced");
        inboxEl.appendChild(n);
      } else {
        b.inbox.forEach(c => inboxEl.appendChild(cardEl(c, "inbox")));
      }
      q(".t-inbox-hd").textContent = (L.inbox || S.t("ui.task.inbox")) + " (" + S.t("ui.task.remaining", { n: b.inbox.length }) + ")";

      ladderEl.innerHTML = "";
      b.slots.forEach((id, i) => {
        const slot = document.createElement("div");
        slot.className = "t-slot";
        slot.dataset.slot = i;
        if (opts.slotDecor) opts.slotDecor(slot, i);
        const num = document.createElement("div");
        num.className = "t-slot-num";
        num.textContent = i + 1;
        slot.appendChild(num);
        if (id) slot.appendChild(cardEl(byId[id], i));
        else {
          const lbl = document.createElement("div");
          lbl.className = "t-slot-lbl";
          lbl.textContent = slotLabels[i] || "—";
          slot.appendChild(lbl);
        }
        ladderEl.appendChild(slot);
      });

      updateConfirm();
      if (opts.onRender) opts.onRender();
    }

    function updateConfirm() {
      const full = b.slots.every(Boolean);
      confirmBtn.disabled = opts.canConfirm ? !opts.canConfirm(full) : !full;
    }

    function cardEl(card, from) {
      const div = document.createElement("div");
      div.className = "card";
      div.dataset.id = card.id;
      div.dataset.from = String(from);
      div.innerHTML = '<div class="card-icon"></div><div class="card-txt"><div class="card-title"></div>' +
                      '<div class="card-detail"></div></div><div class="card-grip">⠿</div>';
      fillCard(div, card);
      if (opts.drag !== false) div.addEventListener("mousedown", onMouseDown);
      if (opts.cardDecor) opts.cardDecor(div, card, from);
      return div;
    }

    // Icon and description are optional (fixed tasks have neither) — hide them when empty.
    function fillCard(el, card) {
      el.querySelector(".card-icon").textContent = card.icon || "";
      el.querySelector(".card-icon").hidden = !card.icon;
      el.querySelector(".card-title").textContent = card.title;
      el.querySelector(".card-detail").textContent = card.detail || "";
      el.querySelector(".card-detail").hidden = !card.detail;
    }

    /* ── state ── */
    // Place `id` (from the inbox or slot `from`) into slot `toSlot`. An occupant
    // goes back to the inbox, or — for a slot-to-slot move — swaps places.
    function place(id, from, toSlot) {
      const displaced = b.slots[toSlot];
      if (displaced === id) return;
      b.slots[toSlot] = id;
      if (from === "inbox") {
        b.inbox = b.inbox.filter(c => c.id !== id);
        if (displaced) { b.inbox = b.inbox.filter(c => c.id !== displaced); b.inbox.push(byId[displaced]); }
      } else {
        b.slots[from] = displaced || null;
      }
    }
    function returnToInbox(id, fromSlot) {
      b.slots[fromSlot] = null;
      if (!b.inbox.some(c => c.id === id)) b.inbox.push(byId[id]);
    }

    /* ── geometry & hit-testing (viewport coordinates) ── */
    const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    function slotAt(x, y) {
      let found = null;
      b.$$(".t-slot").forEach(s => { if (inside(s.getBoundingClientRect(), x, y)) found = +s.dataset.slot; });
      return found;
    }
    const inInboxAt = (x, y) => inside(inboxEl.getBoundingClientRect(), x, y);
    function clearHighlight() { b.$$(".t-slot.drop-target").forEach(s => s.classList.remove("drop-target")); }
    function highlightSlotAt(x, y) {
      clearHighlight();
      const i = slotAt(x, y);
      if (i != null) slotEl(i).classList.add("drop-target");
    }
    const slotEl = i => q(`.t-slot[data-slot="${i}"]`);
    const cardElOf = id => q(`.card[data-id="${id}"]`);
    function centerOf(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }

    /* ── drag ghost ── */
    const ghostApi = {
      show(id, width) {
        fillCard(ghost, byId[id]);
        ghost.style.width = (width || 280) + "px";
        ghost.style.display = "flex";
      },
      move(left, top) { ghost.style.left = left + "px"; ghost.style.top = top + "px"; },
      hide() { ghost.style.display = "none"; },
    };

    /* ── default mouse drag (hint, radial, heatmap, override) ── */
    function onMouseDown(e) {
      if (e.button !== 0 || b.locked) return;
      const card = e.currentTarget;
      const rect = card.getBoundingClientRect();
      b.drag = { id: card.dataset.id, from: card.dataset.from === "inbox" ? "inbox" : +card.dataset.from,
                 started: false, startX: e.clientX, startY: e.clientY,
                 offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, srcW: rect.width };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    }
    function onMouseMove(e) {
      const d = b.drag;
      if (!d) return;
      if (!d.started) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.started = true;
        ghostApi.show(d.id, d.srcW);
        const src = cardElOf(d.id);
        if (src) src.classList.add("ghost");
        if (opts.onDragStart) opts.onDragStart(d);
      }
      highlightSlotAt(e.clientX, e.clientY);
      ghostApi.move(e.clientX - d.offsetX, e.clientY - d.offsetY);
      if (opts.onDragMove) opts.onDragMove(d, e);
    }
    function onMouseUp(e) {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      const d = b.drag;
      b.drag = null;
      clearHighlight();
      if (!d || !d.started) return;
      ghostApi.hide();
      const target = slotAt(e.clientX, e.clientY);
      if (target != null) place(d.id, d.from, target);
      else if (inInboxAt(e.clientX, e.clientY) && d.from !== "inbox") returnToInbox(d.id, d.from);
      if (opts.onDragEnd) opts.onDragEnd(d);
      render();
    }
    cleanups.push(() => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    });

    /* ── lifecycle ── */
    function listen(target, type, fn, o) {
      target.addEventListener(type, fn, o);
      cleanups.push(() => target.removeEventListener(type, fn, o));
    }
    function onDestroy(fn) { cleanups.push(fn); }
    function destroy() {
      while (cleanups.length) { try { cleanups.pop()(); } catch (e) { console.error(e); } }
      root.remove();
    }

    Object.assign(b, {
      render, updateConfirm, place, returnToInbox,
      slotAt, inInboxAt, highlightSlotAt, clearHighlight, slotEl, cardEl: cardElOf, centerOf,
      ghost: ghostApi, isFull: () => b.slots.every(Boolean),
      aiSlot: id => aiRanking.indexOf(id),
      labels: L,
      listen, onDestroy, destroy,
      DRAG_THRESHOLD,
    });
    return b;
  }

  return { create, shuffle };
})();

/* Registry the interaction modules add themselves to:
     Interactions.register("hint", { mount(container, ctx) → board })
   ctx.onConfirm() is how a module reports a confirmed ranking. */
window.Interactions = (function () {
  const reg = {};
  return {
    register(key, mod) { reg[key] = mod; },
    get(key) { return reg[key] || null; },
    keys() { return Object.keys(reg); },
  };
})();
