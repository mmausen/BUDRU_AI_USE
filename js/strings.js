/* ═══════════════════════════════════════════════════════════════════
   STRINGS — interface text lookup over strings.json (English only).
   Dot paths, with {placeholder} interpolation:
     S.t("ui.task.remaining", { n: 3 })
   A missing key renders the key itself and warns, rather than going blank.
   ═══════════════════════════════════════════════════════════════════ */
window.S = (function () {
  let dict = {};

  function load(json) { dict = json || {}; }

  function block(path) {
    return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
  }

  function t(path, vars) {
    let s = block(path);
    if (typeof s !== "string") { console.warn("[BDR] missing string:", path); return path; }
    if (vars) Object.keys(vars).forEach(k => { s = s.split("{" + k + "}").join(String(vars[k])); });
    return s;
  }

  return { load, t, block };
})();
