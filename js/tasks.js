/* ═══════════════════════════════════════════════════════════════════
   TASKS — the three task sets (tasks/*.json), all in one schema:

     placeholder — items A–F, as in the bdr-prototype labs
     fixed       — process sequences with ONE correct order
     prio        — prioritisation: a preferred order with room for interpretation

   Each file holds `meta` (type, board labels per language) and `tasks[]`;
   each task a de/en title + description, a `target-order` (tile keys, top →
   bottom: what the AI recommends) and six tiles with de/en text,
   description, thought, plus a shared `heat` row (% per slot) for the
   heatmap interaction. Structure is shared, prose is per language.

   flatten() turns one task into the single-language shape the board uses,
   so nothing else ever sees the bilingual layout.
   ═══════════════════════════════════════════════════════════════════ */
window.Tasks = (function () {
  const SETS = ["placeholder", "fixed", "prio"];
  const DEV_KEY = "bdr_aiuse_dev_tasks";   // the dev picker's choice, per browser
  const data = {};
  let set = null, lang = null;

  function load(name, json) { data[name] = json; }

  function readDev() { try { return JSON.parse(localStorage.getItem(DEV_KEY) || "{}"); } catch (e) { return {}; } }
  function writeDev(v) { try { localStorage.setItem(DEV_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  // Config decides; in devMode the picker's last choice overrides it.
  function init() {
    const dev = Config.CONFIG.devMode ? readDev() : {};
    set = SETS.includes(dev.set) ? dev.set : Config.TASK_SET;
    lang = ["de", "en"].includes(dev.lang) ? dev.lang : Config.TASK_LANG;
    if (!data[set] || !(data[set].tasks || []).length) {
      console.error(`[BDR] task set "${set}" did not load — falling back to "placeholder".`);
      set = "placeholder";
    }
  }
  function choose(newSet, newLang) {
    if (newSet && data[newSet]) set = newSet;
    if (newLang) lang = newLang;
    writeDev({ set, lang });
  }

  /* The task for AI interaction n (1-based). One task per interaction; a set
     with fewer tasks than interactions wraps around (the placeholder set has one). */
  function forRound(n) {
    const tasks = (data[set] && data[set].tasks) || [];
    if (!tasks.length) return null;
    return flatten(tasks[(n - 1) % tasks.length]);
  }

  function flatten(t) {
    const meta = data[set].meta || {};
    const labels = (meta.labels && (meta.labels[lang] || meta.labels.en)) || {};
    const p = o => (o && (o[lang] || o.en)) || {};
    const tiles = t.tiles.map(x => ({
      id: "t" + x.key,
      key: x.key,
      icon: x.icon || "",
      title: p(x).text || "",
      detail: p(x).description || "",
      thought: p(x).thought || "",
      heat: Array.isArray(x.heat) && x.heat.length === t.tiles.length ? x.heat.slice() : null,
    }));
    return {
      id: t.id, set, lang,
      title: p(t).title || "",
      description: p(t).description || "",
      labels,
      tiles,
      aiRanking: (t["target-order"] || []).map(k => "t" + k),
    };
  }

  return { SETS, load, init, choose, forRound,
           set: () => set, lang: () => lang, has: name => !!data[name] };
})();
