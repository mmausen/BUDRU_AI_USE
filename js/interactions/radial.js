/* ═══════════════════════════════════════════════════════════════════
   3 · RADIAL / OPTIONS (bdr-prototype lab_03).
   Rest the pointer on an inbox card and, after a short dwell, the AI opens
   two placement options beside the pointer: the AI's slot and a plausible
   decoy drawn from the tile's heat row, looking identical and in random
   order. Hover an option to preview, click to place. Or ignore the menu and drag the card by hand.
   ═══════════════════════════════════════════════════════════════════ */
Interactions.register("radial", {
  mount(container, ctx) {
    const CFG = {
      dwell: 220,       // ms hover before the two options appear
      hideDelay: 260,   // ms grace before the menu closes on mouseleave
    };
    const hover = { cardId: null, timer: null, hideTimer: null, menuOpen: false,
                    lastX: null, lastY: null, els: null, srcEl: null };

    /* The AI's slot plus one decoy (0-based, distinct). The decoy is drawn from
       the tile's heat row (the heatmap's probabilities), weighted by them, so it
       is a slot the AI itself finds plausible: usually a neighbour, and in prio
       tasks sometimes the competing reading. Never a slot with 0 % heat. Without
       a heat row (or with all heat on the AI's slot) it falls back to a neighbour. */
    function suggestSlots(id) {
      const trueSlot = b.aiSlot(id);
      const heat = b.byId[id].heat;
      const pool = [0, 1, 2, 3, 4, 5].filter(s => s !== trueSlot);
      let weights = pool.map(s => (heat ? heat[s] : 0) || 0);
      if (!weights.some(w => w > 0)) weights = pool.map(s => (Math.abs(s - trueSlot) === 1 ? 1 : 0));
      const total = weights.reduce((x, y) => x + y, 0);
      let r = Math.random() * total;
      for (let k = 0; k < pool.length; k++) {
        r -= weights[k];
        if (r < 0 && weights[k] > 0) return { trueSlot, decoy: pool[k] };
      }
      return { trueSlot, decoy: pool[weights.lastIndexOf(Math.max.apply(null, weights))] };
    }

    const b = Board.create(container, {
      key: "radial",
      task: ctx.task,
      footerLeft: '<span class="t-note"></span>',
      cardDecor(div, card, from) {
        div.addEventListener("mousedown", () => closeMenu(true));
        if (from !== "inbox") return;
        div.addEventListener("mouseenter", e => onCardEnter(card.id, div, e));
        div.addEventListener("mousemove", e => { hover.lastX = e.clientX; hover.lastY = e.clientY; });
        div.addEventListener("mouseleave", () => onCardLeave(card.id));
      },
      onDragStart() { closeMenu(true); },
      onConfirm: ctx.onConfirm,
    });
    b.$(".t-note").textContent = S.t("interactions.radial.footer");

    const layer = document.createElement("div");
    layer.className = "rm-layer";
    b.root.appendChild(layer);

    function onCardEnter(id, el, e) {
      if (b.drag) return;
      clearTimeout(hover.hideTimer);
      hover.lastX = e.clientX; hover.lastY = e.clientY;
      if (hover.menuOpen && hover.cardId === id) return;
      closeMenu();
      hover.cardId = id;
      clearTimeout(hover.timer);
      hover.timer = setTimeout(() => { if (hover.cardId === id) openMenu(id, el); }, CFG.dwell);
    }
    function onCardLeave(id) {
      clearTimeout(hover.timer);
      if (hover.cardId === id && !hover.menuOpen) hover.cardId = null;
      if (hover.menuOpen) hover.hideTimer = setTimeout(() => closeMenu(), CFG.hideDelay);
    }

    function openMenu(id, el) {
      const s = suggestSlots(id);
      closeMenu(true);
      hover.menuOpen = true;
      hover.cardId = id;
      el.classList.add("suggesting");

      const r = el.getBoundingClientRect();
      const ax = hover.lastX != null ? hover.lastX : r.right;
      const ay = hover.lastY != null ? hover.lastY : r.top + r.height / 2;
      const options = Board.shuffle([{ slot: s.trueSlot, correct: true }, { slot: s.decoy, correct: false }]);
      options[0].dy = -42; options[1].dy = 42;

      hover.els = options.map(p => {
        const btn = document.createElement("div");
        btn.className = "rm-petal";
        btn.style.left = (ax + 130) + "px";
        btn.style.top = (ay + p.dy) + "px";
        btn.innerHTML = '<div class="rm-num"></div><div class="rm-txt"><div class="rm-rank">AI option</div><div class="rm-lbl"></div></div>';
        btn.querySelector(".rm-num").textContent = p.slot + 1;
        btn.querySelector(".rm-lbl").textContent =
          p.slot === 0 ? b.labels.first || S.t("ui.task.mostUrgent")
            : p.slot === 5 ? b.labels.last || S.t("ui.task.leastUrgent") : "Slot " + (p.slot + 1);
        btn.addEventListener("mouseenter", () => {
          clearTimeout(hover.hideTimer);
          btn.classList.add("hovered");
          previewSlot(p.slot);
        });
        btn.addEventListener("mouseleave", () => {
          btn.classList.remove("hovered");
          clearPreview();
          hover.hideTimer = setTimeout(() => closeMenu(), CFG.hideDelay);
        });
        btn.addEventListener("click", () => {
          b.place(id, "inbox", p.slot);
          closeMenu(true);
          b.render();
        });
        layer.appendChild(btn);
        requestAnimationFrame(() => btn.classList.add("show"));
        return btn;
      });
      hover.srcEl = el;
    }

    function previewSlot(i) { clearPreview(); const el = b.slotEl(i); if (el) el.classList.add("slot-preview"); }
    function clearPreview() { b.$$(".t-slot.slot-preview").forEach(s => s.classList.remove("slot-preview")); }
    function closeMenu(immediate) {
      clearTimeout(hover.hideTimer);
      if (hover.srcEl) hover.srcEl.classList.remove("suggesting");
      if (hover.els) hover.els.forEach(el => el.remove());
      hover.els = null; hover.srcEl = null; hover.menuOpen = false;
      if (immediate) { clearTimeout(hover.timer); hover.cardId = null; }
      clearPreview();
    }

    b.listen(window, "scroll", () => closeMenu(true), true);
    b.onDestroy(() => { clearTimeout(hover.timer); clearTimeout(hover.hideTimer); });

    b.render();
    return b;
  },
});
