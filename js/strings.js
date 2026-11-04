/* ═══════════════════════════════════════════════════════════════════
   STRINGS — interface text lookup over strings.json, one tree per
   language ({ "en": {…}, "de": {…} }). Dot paths, with {placeholder}
   interpolation:
     S.t("ui.task.remaining", { n: 3 })
   A key missing in the active language falls back to English; missing in
   both, it renders the key itself and warns, rather than going blank.
   ═══════════════════════════════════════════════════════════════════ */
window.S = (function () {
  const LANGS = ["en", "de"];
  let all = {}, lang = "en";

  function load(json) { all = json || {}; }
  function setLang(l) { if (LANGS.includes(l)) lang = l; }

  const walk = (root, path) =>
    path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), root);
  function block(path) {
    const v = walk(all[lang], path);
    return v !== undefined ? v : walk(all.en, path);
  }

  function fill(s, vars) {
    if (vars) Object.keys(vars).forEach(k => { s = s.split("{" + k + "}").join(String(vars[k])); });
    return s;
  }
  function t(path, vars) {
    const s = block(path);
    if (typeof s !== "string") { console.warn("[BDR] missing string:", path); return path; }
    return fill(s, vars);
  }

  return { LANGS, load, t, block, fill, setLang, lang: () => lang };
})();
