/* ═══════════════════════════════════════════════════════════════════
   4 · HEATMAP (bdr-prototype lab_04).
   Hover (or drag) a card and every slot lights up on a hot→cold scale:
   red = the AI's most probable slot, blue = unlikely. The probabilities are
   the tile's authored `heat` row from the task file (% per slot); a tile
   without one falls back to a Gaussian around its target slot. Purely a passive visual suggestion — nothing is
   clickable, every card is placed by hand.
   Logs "heat_hover" per card hover with how long the heat was on show.
   ═══════════════════════════════════════════════════════════════════ */
Interactions.register("heatmap", {
  mount(container, ctx) {
    const CFG = {
      sigma: 1.2,       // fallback falloff, only for a tile with no `heat` row
      opacity: 0.5,     // overlay alpha at full saturation
      showPct: true,    // numeric probability badge per slot
    };

    // One purple ramp (AI colour, see styles.css): unlikely slots stay near
    // white, the most likely one is full AI purple.
    const STOPS = [
      { t: 0.00, c: [250, 250, 250] },
      { t: 0.50, c: [196, 181, 253] },
      { t: 1.00, c: [109, 40, 217] },
    ];
    function colorForT(t) {
      t = Math.max(0, Math.min(1, t));
      for (let i = 0; i < STOPS.length - 1; i++) {
        const a = STOPS[i], z = STOPS[i + 1];
        if (t >= a.t && t <= z.t) {
          const f = (z.t === a.t) ? 0 : (t - a.t) / (z.t - a.t);
          return a.c.map((v, k) => Math.round(v + (z.c[k] - v) * f));
        }
      }
      return STOPS[STOPS.length - 1].c;
    }
    const luminance = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

    /* Probability the card belongs in each slot. `pct` is what the badge shows;
       `scores` scale it so the hottest slot is 1, which is what the colour
       scale is read against — so a confident tile reads red-hot, and a tile the
       AI is torn on shows two warm slots. */
    function computeHeat(id) {
      let pct = b.byId[id].heat;
      if (!pct) {
        const target = b.aiSlot(id);
        const g = [0, 1, 2, 3, 4, 5].map(i => Math.exp(-((i - target) ** 2) / (2 * CFG.sigma * CFG.sigma)));
        const sum = g.reduce((x, y) => x + y, 0);
        pct = g.map(v => (v / sum) * 100);
      }
      const max = Math.max.apply(null, pct) || 1;
      return { scores: pct.map(v => v / max), pct };
    }

    let activeId = null;
    let hoverId = null, hoverAt = 0;
    function hoverStart(id) { hoverEnd(); hoverId = id; hoverAt = performance.now(); }
    function hoverEnd() {
      if (!hoverId) return;
      const ms = Math.round(performance.now() - hoverAt);
      const h = b.stats.ai.hoversPerCard, k = b.keyOf(hoverId);
      h[k] = (h[k] || 0) + 1;
      b.stats.ai.hovers++;
      Store.log("heat_hover", { card: k, ms });
      hoverId = null;
    }
    function applyHeat(id) {
      const h = computeHeat(id);
      activeId = id;
      const maxIdx = h.scores.indexOf(Math.max.apply(null, h.scores));
      b.$$(".t-slot").forEach(s => {
        const i = +s.dataset.slot;
        const color = colorForT(h.scores[i]);
        const pctEl = s.querySelector(".t-slot-pct");
        s.querySelector(".t-slot-heat").style.background = `rgba(${color.join(",")},${CFG.opacity})`;
        pctEl.textContent = CFG.showPct ? Math.round(h.pct[i]) + "%" : "";
        // Judge contrast on the colour actually shown (the overlay is translucent over white).
        const shown = color.map(v => v * CFG.opacity + 255 * (1 - CFG.opacity));
        pctEl.style.color = luminance(shown) > 150 ? "#2e1065" : "#fff";
        s.classList.add("heat-active");
        s.classList.toggle("best", i === maxIdx);
      });
    }
    function clearHeat() {
      activeId = null;
      b.$$(".t-slot").forEach(s => {
        s.classList.remove("heat-active", "best");
        const p = s.querySelector(".t-slot-pct");
        if (p) p.textContent = "";
      });
    }

    const b = Board.create(container, {
      key: "heatmap",
      task: ctx.task,
      footerLeft: '<div class="t-legend"><span class="lg-cold"></span><span class="bar"></span><span class="lg-hot"></span></div>',
      tune:
        '<label>Opacity <input type="range" class="tune-opacity" min="0.2" max="0.85" step="0.05" value="' + CFG.opacity + '"></label>' +
        '<label class="opt"><input type="checkbox" class="tune-pct" checked> Show %</label>',
      slotDecor(slot) {
        slot.insertAdjacentHTML("afterbegin",
          '<div class="t-slot-heat"></div><div class="t-slot-pct"></div><div class="t-slot-tag"></div>');
        slot.querySelector(".t-slot-tag").textContent = S.t("interactions.heatmap.mostLikely");
      },
      cardDecor(div, card) {
        div.addEventListener("mouseenter", () => {
          if (b.drag) return;
          div.classList.add("suggesting");
          applyHeat(card.id);
          hoverStart(card.id);
        });
        div.addEventListener("mouseleave", () => {
          if (b.drag && b.drag.id === card.id) return;   // keep it up while this card is dragged
          div.classList.remove("suggesting");
          clearHeat();
          hoverEnd();
        });
      },
      onDragStart(d) { applyHeat(d.id); },
      onDragEnd() { clearHeat(); hoverEnd(); },
      onRender() { if (activeId) applyHeat(activeId); },
      onConfirm: ctx.onConfirm,
    });

    b.stats.ai = { hovers: 0, hoversPerCard: {} };
    b.onDestroy(hoverEnd);
    b.$(".lg-cold").textContent = S.t("interactions.heatmap.footer");
    b.$(".lg-hot").textContent = S.t("interactions.heatmap.footerHot");
    const op = b.$(".tune-opacity"), pct = b.$(".tune-pct");
    if (op) op.addEventListener("input", () => { CFG.opacity = +op.value; if (activeId) applyHeat(activeId); });
    if (pct) pct.addEventListener("change", () => { CFG.showPct = pct.checked; if (activeId) applyHeat(activeId); });

    b.render();
    return b;
  },
});
