/* ═══════════════════════════════════════════════════════════════════
   1 · HINT (bdr-prototype lab_01).
   When a card is picked up, the AI highlights the slot it suggests for
   that card. The AI only hints — it never moves or places the card.
   Logs "hint_shown" per pick-up; followed = the drop landed on the hinted slot.
   ═══════════════════════════════════════════════════════════════════ */
Interactions.register("hint", {
  mount(container, ctx) {
    const CFG = { showHint: true };
    let shownFor = null;     // the card whose hint is showing
    const clearHint = () => b.$$(".t-slot.slot-hint").forEach(s => s.classList.remove("slot-hint"));

    const b = Board.create(container, {
      key: "hint",
      task: ctx.task,
      footerLeft: '<span class="t-note"></span>',
      tune: '<label class="opt"><input type="checkbox" class="tune-hint" checked> Show AI hint</label>',
      onDragStart(d) {
        if (!CFG.showHint) return;
        const el = b.slotEl(b.aiSlot(d.id));
        if (el) el.classList.add("slot-hint");
        shownFor = d.id;
        b.stats.ai.hintsShown++;
        Store.log("hint_shown", { card: b.keyOf(d.id), aiSlot: b.aiSlot(d.id) + 1 });
      },
      // render() rebuilds the ladder, so the hint is gone after a drop anyway;
      // clearing explicitly also covers a drop that lands nowhere.
      onDragEnd(d) {
        if (shownFor === d.id) {
          const at = b.slots.indexOf(d.id);
          if (at === b.aiSlot(d.id)) b.stats.ai.hintsFollowed++;
          else b.stats.ai.hintsIgnored++;     // dropped elsewhere, or not placed at all
        }
        shownFor = null;
        clearHint();
      },
      onConfirm: ctx.onConfirm,
    });

    b.stats.ai = { hintsShown: 0, hintsFollowed: 0, hintsIgnored: 0 };
    b.$(".t-note").textContent = S.t("interactions.hint.footer");
    const tune = b.$(".tune-hint");
    if (tune) tune.addEventListener("change", () => { CFG.showHint = tune.checked; });

    b.render();
    return b;
  },
});
