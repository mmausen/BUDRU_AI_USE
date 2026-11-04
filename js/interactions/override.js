/* ═══════════════════════════════════════════════════════════════════
   6 · OVERRIDE — new in this prototype.
   Three phases:
     sort    — the participant ranks all six items alone, no AI help, and
               presses "Hand over to the AI".
     ai      — the board locks; the AI cursor walks the ranking top to bottom
               and moves every tile it disagrees with into its own slot
               (slot-to-slot moves swap the two tiles).
     review  — the AI's changes are marked; Confirm becomes available (and,
               with Config.OVERRIDE.editAfterOverride, the board unlocks).

   The AI ALWAYS overrides at least Config.OVERRIDE.minOverrides tiles. If the
   participant's order already matches the AI's ranking, the AI swaps a
   random adjacent pair — so even full agreement gets overridden.

   Logs "override_handover" (the participant's own order), the AI's moves as
   placements with by "ai", and "override_done" (every tile it changed). The
   result (aiSummary) says for each changed tile whether the participant kept
   the AI's slot, reverted it to their own, or moved it somewhere else.
   ═══════════════════════════════════════════════════════════════════ */
Interactions.register("override", {
  mount(container, ctx) {
    const OPT = Config.OVERRIDE;
    let phase = "sort";
    const aiMoved = new Set();     // ids the AI moved — marked on their cards
    let cursor = null;
    let userOrder = null, changes = null;   // the order handed over; tiles the AI changed

    const b = Board.create(container, {
      key: "override",
      task: ctx.task,
      footerLeft:
        '<span class="t-note"></span>' +
        '<button type="button" class="t-btn t-ai t-handover" disabled></button>',
      cardDecor(div, card) {
        if (aiMoved.has(card.id)) {
          div.classList.add("ai-moved");
          div.insertAdjacentHTML("beforeend", '<span class="ai-tag">AI</span>');
        }
      },
      onDragStart() { if (phase === "review") b.$(".t-note").textContent = ""; },
      onRender() {
        const hb = b.$(".t-handover");
        if (hb) {
          hb.disabled = phase !== "sort" || !b.isFull();
          hb.hidden = phase !== "sort";
        }
      },
      canConfirm: full => phase === "review" && full,
      onConfirm: ctx.onConfirm,
    });

    const note = b.$(".t-note");
    note.textContent = S.t("interactions.override.sortFirst");
    b.$(".t-handover").textContent = S.t("interactions.override.handOver");
    b.$(".t-handover").addEventListener("click", handOver);
    b.root.insertAdjacentHTML("beforeend", '<div class="ai-cursor"><div class="ring"></div>' + AiCursor.SVG + '</div>');
    const cursorEl = b.$(".ai-cursor");

    /* What the AI will make of the participant's order. Its own ranking —
       unless that leaves fewer than minOverrides tiles changed, in which case
       random adjacent swaps are applied until it does not. */
    function targetFor(user) {
      const target = b.aiRanking.slice();
      const changed = () => target.filter((id, i) => id !== user[i]).length;
      let guard = 20;
      while (changed() < OPT.minOverrides && guard--) {
        const i = 0 | (Math.random() * (target.length - 1));
        [target[i], target[i + 1]] = [target[i + 1], target[i]];
      }
      return target;
    }

    async function handOver() {
      if (phase !== "sort" || !b.isFull()) return;
      phase = "ai";
      b.locked = true;
      b.root.classList.add("ai-driving");
      note.textContent = S.t("interactions.override.working");
      b.render();

      const user = b.slots.slice();
      const target = targetFor(user);
      userOrder = user;
      Store.log("override_handover", { order: user.map(b.keyOf) });

      let carrying = null;
      const btn = b.$(".t-handover").getBoundingClientRect();
      cursor = AiCursor.scripted(cursorEl, {
        x: btn.left + btn.width / 2, y: btn.top,
        onMove: (x, y) => { if (carrying) { b.ghost.move(x - 26, y - 20); b.highlightSlotAt(x, y); } },
      });

      try {
        cursor.show(true);
        await cursor.wait(700);
        for (let i = 0; i < target.length; i++) {
          if (b.slots[i] === target[i]) continue;
          const id = target[i];
          const from = b.slots.indexOf(id);
          const src = b.cardEl(id);
          const c = b.centerOf(src);
          await cursor.moveTo(c.x, c.y);
          await cursor.wait(260);
          // grab
          cursor.pulse();
          carrying = id;
          src.classList.add("ghost");
          b.ghost.show(id, c.w);
          b.ghost.move(cursor.x - 26, cursor.y - 20);
          await cursor.wait(180);
          const s = b.centerOf(b.slotEl(i));
          await cursor.moveTo(s.x, s.y);
          await cursor.wait(160);
          // drop: a slot-to-slot move swaps the two tiles
          cursor.pulse();
          carrying = null;
          b.ghost.hide();
          b.clearHighlight();
          aiMoved.add(id);
          if (b.slots[i]) aiMoved.add(b.slots[i]);
          b.place(id, from, i, { by: "ai", method: "ai" });
          b.render();
          await cursor.wait(420);
        }
        await cursor.wait(300);
        cursor.show(false);
      } catch (e) {
        if (e.message === "aborted") return;   // torn down mid-sequence
        throw e;
      }

      const n = b.slots.filter((id, i) => id !== user[i]).length;
      changes = b.slots.map((id, i) => ({ id, userSlot: user.indexOf(id), aiSlot: i }))
                       .filter(c => c.userSlot !== c.aiSlot);
      Store.log("override_done", { changed: changes.map(c => ({ card: b.keyOf(c.id), userSlot: c.userSlot + 1, aiSlot: c.aiSlot + 1 })) });
      phase = "review";
      b.locked = !OPT.editAfterOverride;
      b.root.classList.remove("ai-driving");
      note.textContent = S.t(OPT.editAfterOverride ? "interactions.override.doneEdit" : "interactions.override.done", { n });
      b.render();
    }

    b.onDestroy(() => { if (cursor) cursor.abort(); });

    // For the result: what became of each tile the AI changed, at Confirm.
    b.aiSummary = () => {
      if (!changes) return { handedOver: false };
      const tiles = changes.map(c => {
        const finalSlot = b.slots.indexOf(c.id);
        const fate = finalSlot === c.aiSlot ? "kept" : finalSlot === c.userSlot ? "reverted" : "moved";
        return { card: b.keyOf(c.id), userSlot: c.userSlot + 1, aiSlot: c.aiSlot + 1, finalSlot: finalSlot + 1, fate };
      });
      const count = f => tiles.filter(t => t.fate === f).length;
      return { handedOver: true, userOrder: userOrder.map(b.keyOf), changed: tiles.length,
               kept: count("kept"), reverted: count("reverted"), moved: count("moved"), tiles };
    };

    b.render();
    return b;
  },
});
