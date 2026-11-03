/* ═══════════════════════════════════════════════════════════════════
   2 · MAGNET (bdr-prototype lab_02).
   A fake cursor replaces the real one over the task. A picked-up card
   attaches to it; the cursor is driven by a spring (stiffness + damping)
   in a rAF loop, so near the AI's suggested slot it is pulled toward it —
   with momentum and lag, not a rigid snap. Attraction is measured from the
   tile's RIGHT EDGE, so the pull feels the same wherever the card was
   grabbed.

   The field is circular: within `magnetRadius` of the target the tile is
   moved `magnetStrength` of the way there (peak < 1, so it can be overridden).
   With `snap` (on by default) the inner part — `snapThreshold` × radius — pulls
   the tile fully onto the slot; leaving that zone releases it again.
   The radius is set in SLOT HEIGHTS (`radiusSlots`) and converted to px at
   every pick-up from the height the dragged card's slot will have — the card
   itself plus the slot margins, never below the empty slot — so the field
   covers the same share of the ranking whatever the card size, task set or
   window width (narrow windows wrap the text and make cards taller).
   ═══════════════════════════════════════════════════════════════════ */
Interactions.register("magnet", {
  mount(container, ctx) {
    const CFG = {
      radiusSlots: 2.2,     // field radius in slot heights (2.2 × 72 px ≈ the former fixed 160 px)
      magnetRadius: 160,    // px, derived from radiusSlots × the slot height (see computeRadius)
      magnetStrength: 0.24, // 0–1 displacement toward the magnet (peak < 1 → overridable)
      springK: 0.22,        // spring stiffness
      damping: 0.62,        // velocity damping per frame
      snap: true,           // hard-snap to the slot when very close
      snapThreshold: 0.55,  // fraction of radius at which snap kicks in
    };
    const CARD_MARGIN_R = 10;   // px: the placed card's right margin — the tile's right edge snaps here
    const CURSOR_SVG =
      '<svg width="22" height="26" viewBox="0 0 22 26" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M2 1.5 L2 20.5 L7 15.6 L10.3 22.8 L13.2 21.5 L10 14.4 L17.2 14.4 Z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';

    const real = { x: 0, y: 0 }, fake = { x: 0, y: 0 }, vel = { x: 0, y: 0 };
    let cursorActive = false, rafId = null, lastTick = 0, slotH = 72;
    let drag = null;

    const b = Board.create(container, {
      key: "magnet",
      task: ctx.task,
      drag: false,                       // this module drives its own drag
      footerLeft: '<span class="t-note"></span>',
      tune:
        range("Strength", "magnetStrength", 0, 1, 0.02) + range("Radius (slots)", "radiusSlots", 0, 6, 0.1) +
        '<label class="opt"><input type="checkbox" class="tune-snap"' + (CFG.snap ? " checked" : "") + '> Snap</label>' +
        range("Spring", "springK", 0.05, 0.6, 0.01) +
        '<span class="tune-readout"></span>',
      cardDecor(div) { div.addEventListener("mousedown", onMouseDown); },
      onConfirm: ctx.onConfirm,
    });
    b.$(".t-note").textContent = S.t("interactions.magnet.footer");
    b.root.classList.add("no-cursor");
    b.root.insertAdjacentHTML("beforeend",
      '<canvas class="fx-canvas"></canvas><div class="fake-cursor">' + CURSOR_SVG + '</div>');
    const fxCanvas = b.$(".fx-canvas"), fxCtx = fxCanvas.getContext("2d"), fakeCursor = b.$(".fake-cursor");

    const t = sel => b.$(sel);
    function range(label, key, min, max, stepV) {
      return `<label title="${key}">${label} <input type="range" data-cfg="${key}" min="${min}" max="${max}" step="${stepV}" value="${CFG[key]}"></label>`;
    }
    if (t(".tune-snap")) {
      b.$$("[data-cfg]").forEach(el => el.addEventListener("input", () => {
        CFG[el.dataset.cfg] = +el.value;
        computeRadius();
        readout();
      }));
      t(".tune-snap").addEventListener("change", e => { CFG.snap = e.target.checked; });
    }
    function readout() {
      const el = t(".tune-readout");
      if (!el) return;
      el.textContent = `strength ${CFG.magnetStrength} · radius ${CFG.radiusSlots} slots = ${CFG.magnetRadius}px (slot ${slotH}px)`;
    }

    /* ── magnet geometry ── */
    function snapPoint() {
      if (!drag) return null;
      const el = b.slotEl(b.aiSlot(drag.id));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.right - CARD_MARGIN_R, y: r.top + r.height / 2 };
    }
    const anchorAt = (px, py) => ({ x: px + drag.anchorOffX, y: py + drag.anchorOffY });
    // The slot under the tile: hit-tested at its right edge, but once the edge has
    // overshot the ladder (wide card, pointer far right) the tile still overlaps the
    // column, so test at the edge's height inside the column instead.
    function slotUnder(a, d) {
      const hit = b.slotAt(a.x, a.y);
      if (hit != null) return hit;
      const S = b.slotEl(0).getBoundingClientRect();   // the slot column (narrower than the ladder)
      const left = a.x - ((d || drag).srcW || 280);
      if (a.x < S.left || left > S.right) return null;
      return b.slotAt(Math.max(S.left + 1, Math.min(S.right - 1, a.x)), a.y);
    }

    // Where the cursor "wants" to be: the tile's right edge is attracted to the
    // magnet, then converted back into a cursor target the spring chases.
    function computeTarget() {
      if (drag && drag.started) {
        const snap = snapPoint();
        if (snap) {
          const a = anchorAt(real.x, real.y);
          const dx = snap.x - a.x, dy = snap.y - a.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < CFG.magnetRadius) {
            let tx, ty;
            if (CFG.snap && dist < CFG.magnetRadius * CFG.snapThreshold) { tx = snap.x; ty = snap.y; }
            else { tx = a.x + dx * CFG.magnetStrength; ty = a.y + dy * CFG.magnetStrength; }
            return { x: tx - drag.anchorOffX, y: ty - drag.anchorOffY };
          }
        }
      }
      return { x: real.x, y: real.y };
    }

    function sizeCanvas() {
      const r = b.root.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      fxCanvas.width = Math.max(1, Math.round(r.width * dpr));
      fxCanvas.height = Math.max(1, Math.round(r.height * dpr));
      fxCanvas.style.width = r.width + "px";
      fxCanvas.style.height = r.height + "px";
      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // Radius in px = radiusSlots × the slot height. An empty slot is 72 px (CSS
    // min-height); a filled one grows to its card + margins. So while dragging, the
    // unit is the slot this card will fill: its own height + SLOT_MARGIN_Y.
    const SLOT_MIN_H = 72, SLOT_MARGIN_Y = 18;   // keep in sync with .t-slot / .t-slot .card in styles.css
    function computeRadius() {
      const card = drag && drag.srcH ? drag.srcH + SLOT_MARGIN_Y : 0;
      slotH = Math.round(Math.max(SLOT_MIN_H, card || slotH));
      CFG.magnetRadius = Math.round(CFG.radiusSlots * slotH);
    }

    /* ── spring loop ── */
    function tick() { rafId = requestAnimationFrame(tick); lastTick = performance.now(); step(); }
    function step() {
      const tr = b.root.getBoundingClientRect();
      fxCtx.clearRect(0, 0, tr.width, tr.height);
      if (!cursorActive) return;
      const target = computeTarget();
      vel.x += (target.x - fake.x) * CFG.springK;
      vel.y += (target.y - fake.y) * CFG.springK;
      vel.x *= CFG.damping; vel.y *= CFG.damping;
      fake.x += vel.x; fake.y += vel.y;
      if (drag && drag.started) {
        b.ghost.move(fake.x - drag.offsetX, fake.y - drag.offsetY);
        const a = anchorAt(fake.x, fake.y);
        b.clearHighlight();
        const hi = slotUnder(a);
        if (hi != null) b.slotEl(hi).classList.add("drop-target");
        drawTether(tr);
      }
      fakeCursor.style.left = (fake.x - 2) + "px";
      fakeCursor.style.top = (fake.y - 2) + "px";
    }
    // Dashed tether from the magnet to the cursor; it grows as the card nears the slot.
    function drawTether(tr) {
      const snap = snapPoint();
      if (!snap) return;
      const a = anchorAt(real.x, real.y);
      const k = Math.max(0, 1 - Math.hypot(snap.x - a.x, snap.y - a.y) / CFG.magnetRadius);
      if (k <= 0) return;
      fxCtx.save();
      fxCtx.beginPath();
      fxCtx.setLineDash([3, 5]);
      fxCtx.moveTo(snap.x - tr.left, snap.y - tr.top);
      fxCtx.lineTo(fake.x - tr.left, fake.y - tr.top);
      fxCtx.strokeStyle = "rgba(109,40,217," + (0.55 * k) + ")";   // AI purple
      fxCtx.lineWidth = 1;
      fxCtx.stroke();
      fxCtx.restore();
    }

    /* ── pointer tracking ── */
    function onMove(e) {
      real.x = e.clientX; real.y = e.clientY;
      const r = b.root.getBoundingClientRect();
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (over) {
        if (!cursorActive) { cursorActive = true; fake.x = real.x; fake.y = real.y; vel.x = vel.y = 0; }
        fakeCursor.style.display = "block";
        if (drag && !drag.started && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) >= b.DRAG_THRESHOLD) startDrag();
        if (performance.now() - lastTick > 60) step();   // keep the spring moving if rAF is throttled
      } else {
        cursorActive = false;
        fakeCursor.style.display = "none";
      }
    }

    /* ── drag ── */
    function onMouseDown(e) {
      if (e.button !== 0) return;
      const card = e.currentTarget;
      const rect = card.getBoundingClientRect();
      drag = { id: card.dataset.id, from: card.dataset.from === "inbox" ? "inbox" : +card.dataset.from,
               started: false, startX: e.clientX, startY: e.clientY,
               offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
               srcW: rect.width, srcH: rect.height };
      e.preventDefault();
    }
    function startDrag() {
      drag.started = true;
      computeRadius();          // slot heights may have changed since the last pick-up
      readout();
      drag.anchorOffX = (drag.srcW || 280) - drag.offsetX;   // the tile's right edge…
      drag.anchorOffY = (drag.srcH || 72) / 2 - drag.offsetY; // …vertically centred
      b.ghost.show(drag.id, drag.srcW);
      const src = b.cardEl(drag.id);
      if (src) src.classList.add("ghost");
    }
    function onMouseUp() {
      b.clearHighlight();
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.started) return;
      b.ghost.hide();
      // Drop where the card is shown: slots are hit by the tile's right edge
      // (the magnet anchor), the inbox by the cursor.
      const ax = fake.x + d.anchorOffX, ay = fake.y + d.anchorOffY;
      const target = slotUnder({ x: ax, y: ay }, d);
      if (target != null) b.place(d.id, d.from, target);
      else if (b.inInboxAt(fake.x, fake.y) && d.from !== "inbox") b.returnToInbox(d.id, d.from);
      b.render();
    }

    b.listen(document, "mousemove", onMove);
    b.listen(document, "mouseup", onMouseUp);
    b.listen(window, "resize", () => { sizeCanvas(); computeRadius(); readout(); });
    b.onDestroy(() => { if (rafId) cancelAnimationFrame(rafId); });

    b.render();
    sizeCanvas();
    computeRadius();
    readout();
    rafId = requestAnimationFrame(tick);
    return b;
  },
});
