/* ═══════════════════════════════════════════════════════════════════
   5 · HANDOFF (bdr-prototype lab_05).
   A shared cursor with a TAKE-OVER ZONE (after bdr-dt-handoff). The
   participant drags tiles by hand; while their real cursor rests inside the
   zone in the footer (for CFG.dwellMs) a fake AI cursor fades in, takes over
   and carries on sorting — planning a human-ish motion (think → curve toward
   the tile → grab → carry → drop). Leaving the zone hands control straight
   back: the AI cursor rushes to the participant's pointer and fades out, and
   a tile it was carrying goes back to the inbox untouched. The AI drops each
   tile in its own suggested slot.
   ═══════════════════════════════════════════════════════════════════ */
Interactions.register("handoff", {
  mount(container, ctx) {
    const CFG = {
      dwellMs: 250,      // ms the cursor must rest in the zone before the AI takes over (0 = instant)
      speed: 10,         // 0–100 → travel speed (10 ≈ 527 px/s, half the original 28 ≈ 1062 px/s)
      hesitate: true,    // thinking pauses + second-guess approaches
      speedMin: 230, speedMax: 3200,   // px/s at speed 0 / 100
      fadeInMs: 500, fadeOutMs: 220,
      returnMs: 190,     // rush back to the user's pointer when they leave the zone
    };

    const lerp = (a, z, t) => a + (z - a) * t;
    const clamp = (v, a, z) => Math.max(a, Math.min(z, v));
    const rand = (a, z) => a + Math.random() * (z - a);
    const distp = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const easeOutBack = (t, s) => { s = s == null ? 1.1 : s; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
    const speedPPS = () => lerp(CFG.speedMin, CFG.speedMax, CFG.speed / 100);

    const fc = { x: 0, y: 0, opacity: 0, active: false, carrying: null, seg: null, queue: [],
                 returning: false, returnT: 0, returnFrom: { x: 0, y: 0 } };
    let zoneSince = null;             // when the pointer entered the zone (null = outside)
    let lastPointer = { x: 0, y: 0 };
    let prev = performance.now(), lastStepTs = prev, rafId = null, watchdog = null;
    let drag = null;

    const b = Board.create(container, {
      key: "handoff",
      task: ctx.task,
      drag: false,
      bannerRight: '<span class="ai-mode"><span class="dot"></span><span class="ai-mode-txt"></span></span>',
      tune:
        '<label>Zone delay <input type="range" class="tune-dwell" min="0" max="1500" step="50" value="' + CFG.dwellMs + '"></label>' +
        '<label>Speed <input type="range" class="tune-speed" min="0" max="100" value="' + CFG.speed + '"></label>' +
        '<label class="opt"><input type="checkbox" class="tune-hes" checked> Hesitation</label>',
      cardDecor(div, card, from) { div.addEventListener("pointerdown", e => onCardPointerDown(e, card.id, from)); },
      onConfirm: ctx.onConfirm,
    });
    b.root.insertAdjacentHTML("beforeend",
      '<div class="ai-cursor"><div class="ring"></div>' + AiCursor.SVG + '</div>');
    const cursorEl = b.$(".ai-cursor"), modeEl = b.$(".ai-mode"), modeTxt = b.$(".ai-mode-txt");
    // The zone floats over the lower centre of the board, straddling both columns.
    b.$(".t-main").insertAdjacentHTML("beforeend",
      '<div class="ai-zone"><span class="ai-zone-dot"></span><span class="ai-zone-label"></span></div>');
    const zoneEl = b.$(".ai-zone"), zoneTxt = b.$(".ai-zone-label");
    if (b.$(".tune-speed")) {
      b.$(".tune-dwell").addEventListener("input", e => { CFG.dwellMs = +e.target.value; });
      b.$(".tune-speed").addEventListener("input", e => { CFG.speed = +e.target.value; });
      b.$(".tune-hes").addEventListener("change", e => { CFG.hesitate = e.target.checked; });
    }

    /* ── user dragging (pointer events; drop by pointer position) ── */
    function onCardPointerDown(e, id, from) {
      if (e.button != null && e.button !== 0) return;
      const card = e.currentTarget;
      const rect = card.getBoundingClientRect();
      drag = { id, from, started: false, startX: e.clientX, startY: e.clientY,
               offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, srcW: rect.width };
      if (card.setPointerCapture) { try { card.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      e.preventDefault();
    }
    function onDragMove(e) {
      if (!drag) return;
      if (!drag.started) {
        if (distp(e.clientX, e.clientY, drag.startX, drag.startY) < b.DRAG_THRESHOLD) return;
        drag.started = true;
        b.ghost.show(drag.id, drag.srcW);
        const src = b.cardEl(drag.id);
        if (src) src.classList.add("ghost");
      }
      b.highlightSlotAt(e.clientX, e.clientY);
      b.ghost.move(e.clientX - drag.offsetX, e.clientY - drag.offsetY);
    }
    function onDragUp(e) {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.started) return;
      b.ghost.hide();
      b.clearHighlight();
      const target = b.slotAt(e.clientX, e.clientY);
      if (target != null) b.place(d.id, d.from, target);
      else if (b.inInboxAt(e.clientX, e.clientY) && d.from !== "inbox") b.returnToInbox(d.id, d.from);
      b.render();
      trackPointer(e);
    }

    /* ── take-over zone ──
       Governed by where the real pointer is, not by idle time: inside the zone
       → the AI drives; outside → the participant does. Hit-tested on every move
       (not mouseenter) so a pointer already resting there when the task starts
       or the intro card closes still counts. */
    function inZone(x, y) {
      const r = zoneEl.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }
    function trackPointer(e) {
      if (e.clientX == null) return;
      lastPointer = { x: e.clientX, y: e.clientY };
      const inside = !drag && inZone(e.clientX, e.clientY);   // dragging a card over it never hands off
      if (inside && zoneSince == null) zoneSince = performance.now();
      if (!inside) { zoneSince = null; if (fc.active) deactivate(); }
    }
    function activate() {
      const r = b.root.getBoundingClientRect();
      fc.active = true;
      fc.returning = false;
      fc.x = lastPointer.x || (r.left + r.width / 2);
      fc.y = lastPointer.y || (r.top + r.height / 2);
      // Not logged yet. Hook: Store.log("ai_took_over", { interaction: "handoff" });
    }
    function deactivate() {
      fc.active = false;
      fc.queue.length = 0;
      fc.seg = null;
      if (fc.carrying != null) {
        const src = b.$(`.t-inbox [data-id="${fc.carrying}"]`);
        if (src) src.classList.remove("ghost");   // never left the inbox — just un-dim it
        b.ghost.hide();
        fc.carrying = null;
      }
      b.clearHighlight();
      // Not logged yet. Hook: Store.log("user_took_back", { interaction: "handoff" });
      // Rush the cursor back to the user's pointer before fading: "here, it's yours again".
      if (fc.opacity > 0.05) { fc.returning = true; fc.returnT = 0; fc.returnFrom = { x: fc.x, y: fc.y }; }
      else fc.returning = false;
    }

    /* ── AI motion planning (queue of pause / move / grab / drop) ── */
    const pushMove = (x, y, ease, curve) => fc.queue.push({ type: "move", to: { x, y }, ease: ease || "cubic", curve: curve == null ? 0.12 : curve, t: 0 });
    const pushPause = ms => fc.queue.push({ type: "pause", dur: ms, t: 0 });
    const pushGrab = id => fc.queue.push({ type: "grab", id });
    const pushDrop = slot => fc.queue.push({ type: "drop", slot });
    const tileCenter = id => b.centerOf(b.$(`.t-inbox [data-id="${id}"]`));

    function planJob() {
      const free = b.inbox.filter(c => c.id !== fc.carrying);
      if (!free.length) { pushPause(400); return; }
      // nearest unplaced tile to the cursor
      let target = free[0], best = Infinity;
      free.forEach(c => {
        const ctr = tileCenter(c.id);
        if (ctr) { const d = distp(fc.x, fc.y, ctr.x, ctr.y); if (d < best) { best = d; target = c; } }
      });
      const cc = tileCenter(target.id);
      if (!cc) { pushPause(300); return; }
      const hes = CFG.hesitate;

      pushPause(hes ? rand(350, 1000) : rand(120, 260));                 // 1. think
      if (hes && Math.random() < 0.6) {                                  // 2. travel (maybe second-guess)
        pushMove(cc.x + rand(-40, 40), cc.y + rand(-44, -14), "cubic", 0.18);
        pushPause(rand(180, 480));
        pushMove(cc.x, cc.y, "back", 0.05);
      } else pushMove(cc.x, cc.y, "back", 0.13);
      pushGrab(target.id);                                               // 3. grab
      pushPause(hes ? rand(160, 360) : rand(90, 170));
      const slotIdx = b.aiSlot(target.id);                               // 4. carry to the AI's slot
      const sc = b.centerOf(b.slotEl(slotIdx)) || { x: fc.x, y: fc.y };
      if (hes && Math.random() < 0.5) {
        pushMove(sc.x + rand(-30, 30), sc.y - rand(40, 80), "cubic", 0.10);
        pushPause(rand(200, 520));
        pushMove(sc.x, sc.y, "cubic", 0.04);
      } else pushMove(sc.x, sc.y, "back", 0.08);
      pushDrop(slotIdx);                                                 // 5. drop
      pushPause(hes ? rand(260, 520) : rand(160, 300));
    }

    function startSegment() {
      fc.seg = fc.queue.shift() || null;
      if (!fc.seg || fc.seg.type !== "move") return;
      const p0 = { x: fc.x, y: fc.y }, p1 = fc.seg.to;
      const d = Math.max(1, distp(p0.x, p0.y, p1.x, p1.y));
      const nx = -(p1.y - p0.y) / d, ny = (p1.x - p0.x) / d;
      const amp = d * fc.seg.curve * (Math.random() < 0.5 ? -1 : 1);
      fc.seg.p0 = p0; fc.seg.p1 = p1;
      fc.seg.ctrl = { x: (p0.x + p1.x) / 2 + nx * amp, y: (p0.y + p1.y) / 2 + ny * amp };
      fc.seg.dur = clamp(d / speedPPS() * 1000 * (CFG.hesitate ? 1.22 : 1), 170, 4000);
      fc.seg.t = 0;
    }
    const bezier = (p0, c, p1, t) => { const u = 1 - t; return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y }; };

    function updateMotion(dt) {
      if (!fc.seg) {
        if (!fc.queue.length) planJob();
        startSegment();
        if (!fc.seg) return;
      }
      const s = fc.seg;
      if (s.type === "pause") {
        s.t += dt;
        if (s.t >= s.dur) fc.seg = null;
      } else if (s.type === "move") {
        s.t += dt / s.dur;
        const tt = clamp(s.t, 0, 1);
        const pos = bezier(s.p0, s.ctrl, s.p1, s.ease === "back" ? easeOutBack(tt) : easeInOutCubic(tt));
        fc.x = pos.x; fc.y = pos.y;
        if (fc.carrying != null) { b.ghost.move(fc.x - 26, fc.y - 20); b.highlightSlotAt(fc.x, fc.y); }
        if (s.t >= 1) { fc.x = s.p1.x; fc.y = s.p1.y; fc.seg = null; }
      } else if (s.type === "grab") {
        const ctr = tileCenter(s.id);
        if (ctr && b.inbox.some(c => c.id === s.id)) {
          fc.carrying = s.id;
          const src = b.$(`.t-inbox [data-id="${s.id}"]`);
          if (src) src.classList.add("ghost");
          b.ghost.show(s.id, ctr.w);
          b.ghost.move(fc.x - 26, fc.y - 20);
          AiCursor.pulse(cursorEl);
        }
        fc.seg = null;
      } else if (s.type === "drop") {
        const id = fc.carrying;
        fc.carrying = null;
        if (id != null) {
          b.ghost.hide();
          b.clearHighlight();
          AiCursor.pulse(cursorEl);
          b.place(id, "inbox", s.slot);
          b.render();
        }
        fc.seg = null;
      }
    }

    function updateReturn(dt) {
      fc.returnT += dt / CFG.returnMs;
      const e = easeInOutCubic(clamp(fc.returnT, 0, 1));
      fc.x = lerp(fc.returnFrom.x, lastPointer.x, e);
      fc.y = lerp(fc.returnFrom.y, lastPointer.y, e);
      if (fc.returnT >= 1) { fc.x = lastPointer.x; fc.y = lastPointer.y; fc.returning = false; }
    }

    /* ── drive loop (rAF primary; setInterval watchdog for throttled tabs) ── */
    function step(now) {
      const dt = Math.min(50, now - prev); prev = now; lastStepTs = now;
      const complete = b.isFull();
      // No takeover while the intro card is open (ctx.paused) — it would sort behind it.
      if (!complete && !fc.active && !drag && !ctx.paused() && zoneSince != null && (now - zoneSince) >= CFG.dwellMs) activate();
      if ((complete || ctx.paused()) && fc.active) deactivate();

      const targetOp = (fc.active || fc.returning) ? 1 : 0;
      const rate = fc.active ? dt / CFG.fadeInMs : dt / CFG.fadeOutMs;
      if (fc.opacity < targetOp) fc.opacity = Math.min(targetOp, fc.opacity + rate);
      else if (fc.opacity > targetOp) fc.opacity = Math.max(targetOp, fc.opacity - rate);

      if (fc.active && fc.opacity > 0.05) updateMotion(dt);
      else if (fc.returning) updateReturn(dt);

      if (fc.opacity > 0) {
        const jx = Math.sin(now / 180) + Math.sin(now / 70) * 0.5;
        const jy = Math.cos(now / 160) + Math.cos(now / 90) * 0.5;
        cursorEl.style.opacity = fc.opacity.toFixed(3);
        cursorEl.style.transform = `translate(${(fc.x + jx).toFixed(1)}px,${(fc.y + jy).toFixed(1)}px)`;
      } else cursorEl.style.opacity = "0";

      const autoOn = fc.active && fc.opacity > 0.6;
      modeEl.classList.toggle("auto", autoOn);
      modeTxt.textContent = S.t(autoOn ? "interactions.handoff.ai" : "interactions.handoff.you");
      b.root.classList.toggle("ai-driving", autoOn);
      zoneEl.classList.toggle("active", fc.active);
      zoneEl.classList.toggle("done", complete);
      zoneTxt.textContent = S.t("interactions.handoff.zone." + (complete ? "done" : fc.active ? "active" : "idle"));
    }
    function rafLoop(now) { step(now); rafId = requestAnimationFrame(rafLoop); }

    b.listen(window, "pointermove", e => { trackPointer(e); onDragMove(e); }, { passive: true });
    b.listen(window, "pointerup", onDragUp);
    b.onDestroy(() => { if (rafId) cancelAnimationFrame(rafId); clearInterval(watchdog); });

    b.render();
    rafId = requestAnimationFrame(rafLoop);
    watchdog = setInterval(() => { const now = performance.now(); if (now - lastStepTs > 90) step(now); }, 60);
    return b;
  },
});
