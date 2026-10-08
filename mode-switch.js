/*
  Mode switch: three symbols in a circle.
  - the active symbol sits big in the centre
  - the other two sit small at random spots in the ring around it
  - clicking a small one swaps it into the centre and sends the old
    centre symbol to a new random spot (never overlapping the others)
  Also tells the media carousel to switch category.
*/
(function () {
  "use strict";

  const circle = document.getElementById("modeCircle");
  if (!circle) return;
  const syms = Array.from(circle.querySelectorAll(".mode-sym"));
  const current = document.getElementById("modeCurrent");
  const NAMES = {
    "products": "products",
    "motion-3d": "motion+3d",
    "graphics-illustrations": "graphics+illustrations"
  };
  // keep in sync with --mode-dur in style.css
  const STEP_MS = 280;

  // all sizes are fractions of the circle's radius (centre = 0,0, edge = 1)
  const BIG = 0.42;      // big symbol diameter, as fraction of circle width
  const SMALL = 0.16;    // small symbol diameter
  const R_BIG = BIG;     // big symbol radius in "radius units" (= BIG/2 * 2)
  const R_SMALL = SMALL; // likewise
  const GAP = 0.06;      // breathing room between things
  const MIN_D = R_BIG + R_SMALL + GAP;   // closest a small one may get to centre
  const MAX_D = 1 - R_SMALL - GAP;      // furthest (keeps it off the border)

  // position (x, y in -1..1) of each small symbol, keyed by category
  const pos = {};
  let active = syms[1].dataset.cat;  // selected category
  let centre = active;               // what's physically in the middle
  let busy = false;

  function randomSpot(avoid) {
    for (let tries = 0; tries < 200; tries++) {
      const a = Math.random() * Math.PI * 2;
      // sqrt keeps the spread even over the ring's area
      const d = Math.sqrt(MIN_D * MIN_D + Math.random() * (MAX_D * MAX_D - MIN_D * MIN_D));
      const p = { x: Math.cos(a) * d, y: Math.sin(a) * d };
      const clear = avoid.every(function (o) {
        return Math.hypot(o.x - p.x, o.y - p.y) > R_SMALL * 2 + GAP * 1.5;
      });
      if (clear) return p;
    }
    return { x: 0, y: -MIN_D - 0.1 }; // fallback, practically never hit
  }

  function place(btn, p, size) {
    btn.style.left = (50 + p.x * 50) + "%";
    btn.style.top = (50 + p.y * 50) + "%";
    btn.style.width = (size * 100) + "%";
  }

  function render() {
    syms.forEach(function (btn) {
      const cat = btn.dataset.cat;
      const inCentre = cat === centre;
      btn.classList.toggle("is-active", cat === active);
      btn.setAttribute("aria-pressed", cat === active);
      btn.tabIndex = cat === active ? -1 : 0;
      place(btn, inCentre ? { x: 0, y: 0 } : pos[cat], inCentre ? BIG : SMALL);
    });
  }

  function setLabel(cat) {
    current.textContent = NAMES[cat] || cat;
  }

  // two steps: the centre symbol moves out first, then the clicked one moves in
  function select(cat) {
    if (cat === active || busy) return;
    busy = true;
    const old = active;
    active = cat;

    // step 1: old centre leaves to a random free spot (clear of both small ones)
    const others = Object.keys(pos).map(function (k) { return pos[k]; });
    pos[old] = randomSpot(others);
    centre = null;
    render();
    setLabel(cat);
    if (window.setMediaCategory) window.setMediaCategory(cat);

    // step 2: clicked symbol moves into the middle
    setTimeout(function () {
      delete pos[cat];
      centre = cat;
      render();
      setTimeout(function () { busy = false; }, STEP_MS);
    }, STEP_MS);
  }

  // --- arrows: step through media, flash white as feedback
  const arrows = {};
  document.querySelectorAll(".mode-arrow").forEach(function (btn) {
    arrows[btn.dataset.dir] = btn;
    btn.addEventListener("click", function () {
      btn.blur();
      flash(btn.dataset.dir);
      if (window.stepMedia) window.stepMedia(btn.dataset.dir === "down" ? 1 : -1);
    });
  });
  function flash(dir) {
    const btn = arrows[dir];
    if (!btn) return;
    btn.classList.remove("flash");
    void btn.offsetWidth; // restart the animation
    btn.classList.add("flash");
  }
  // keyboard arrows flash too (script.js already does the stepping)
  document.addEventListener("keydown", function (e) {
    // left = previous (same as up), right = next (same as down)
    const map = { ArrowUp: "up", ArrowLeft: "up", ArrowDown: "down", ArrowRight: "down" };
    if (map[e.key]) flash(map[e.key]);
  });

  // initial random layout
  syms.forEach(function (btn) {
    const cat = btn.dataset.cat;
    if (cat === active) return;
    pos[cat] = randomSpot(Object.keys(pos).map(function (k) { return pos[k]; }));
  });
  current.textContent = NAMES[active];
  // first paint without animation
  syms.forEach(function (b) { b.style.transition = "none"; });
  render();
  void circle.offsetWidth;
  syms.forEach(function (b) { b.style.transition = ""; });

  syms.forEach(function (btn) {
    btn.addEventListener("click", function () { btn.blur(); select(btn.dataset.cat); });
  });


  if (window.setMediaCategory) window.setMediaCategory(active);
})();
