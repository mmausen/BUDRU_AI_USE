/* ═══════════════════════════════════════════════════════════════════
   AI CURSOR — the visible AI pointer shared by HANDOFF (5) and OVERRIDE (6):
   the glyph, the click pulse, and a small promise-based mover for scripted
   sequences (override). Handoff keeps its own planner from lab_05.
   ═══════════════════════════════════════════════════════════════════ */
window.AiCursor = (function () {
  const SVG =
    '<svg viewBox="0 0 26 30" width="26" height="30"><path d="M2 2 L2 22 L8 17 L12 25 L15.5 23.5 L11.5 15.5 L19 15.5 Z" ' +
    'fill="#fff" stroke="#1d1d1f" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function pulse(el) {
    if (!el) return;
    el.classList.remove("clicking");
    void el.offsetWidth;   // restart the ring animation
    el.classList.add("clicking");
  }

  const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* A scripted cursor: await c.moveTo(x, y), await c.wait(ms). Every await
     rejects with "aborted" once c.abort() is called, so a sequence stops
     cleanly when the interaction is torn down (dev Skip, step jump). */
  function scripted(el, opts) {
    opts = opts || {};
    const pps = opts.speed || 700;        // px per second
    let x = opts.x || 0, y = opts.y || 0, aborted = false, onMove = opts.onMove || null;
    const place = () => { el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; };
    const check = () => { if (aborted) throw new Error("aborted"); };

    function moveTo(tx, ty) {
      check();
      const x0 = x, y0 = y;
      const d = Math.hypot(tx - x0, ty - y0);
      const dur = Math.max(220, Math.min(1600, d / pps * 1000));
      // a slight arc, so it reads as a hand rather than a plotter
      const nx = -(ty - y0) / (d || 1), ny = (tx - x0) / (d || 1), amp = d * 0.08;
      const cx = (x0 + tx) / 2 + nx * amp, cy = (y0 + ty) / 2 + ny * amp;
      return new Promise((resolve, reject) => {
        const t0 = performance.now();
        (function frame(now) {
          if (aborted) { reject(new Error("aborted")); return; }
          const t = easeInOutCubic(Math.min(1, (now - t0) / dur)), u = 1 - t;
          x = u * u * x0 + 2 * u * t * cx + t * t * tx;
          y = u * u * y0 + 2 * u * t * cy + t * t * ty;
          place();
          if (onMove) onMove(x, y);
          if (now - t0 < dur) requestAnimationFrame(frame); else resolve();
        })(performance.now());
      });
    }
    function wait(ms) {
      check();
      return new Promise((resolve, reject) => setTimeout(() => (aborted ? reject(new Error("aborted")) : resolve()), ms));
    }
    function show(on) { el.style.opacity = on ? "1" : "0"; }
    function jump(nx, ny) { x = nx; y = ny; place(); }

    return { moveTo, wait, show, jump, pulse: () => pulse(el), abort() { aborted = true; },
             get x() { return x; }, get y() { return y; } };
  }

  return { SVG, pulse, scripted };
})();
