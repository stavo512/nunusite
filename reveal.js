/*
  Box 1 reveal stack: scales each word so it spans the full width of
  the box exactly. Re-runs on resize and once web fonts have loaded.
*/
(function () {
  "use strict";

  const stack = document.getElementById("revealStack");
  if (!stack) return;
  const words = Array.from(stack.querySelectorAll(".reveal-word"));
  const BASE = 100; // measure at 100px, then scale

  // fits the *visible ink* of each word to the box width. Measuring only
  // the text box isn't enough: the negative letter-spacing and the overhang
  // of letters like the "y" in philosophy stick out past it and got clipped.
  const ctx = document.createElement("canvas").getContext("2d");
  function fit() {
    const target = stack.clientWidth;
    if (!target) return;
    words.forEach(function (h) {
      const span = h.firstElementChild;
      h.style.fontSize = BASE + "px";
      span.style.marginLeft = "0px";
      const w = span.getBoundingClientRect().width;
      if (!w) return;
      const cs = getComputedStyle(h);
      const ls = parseFloat(cs.letterSpacing) || 0;  // px at 100px
      ctx.font = cs.fontWeight + " " + BASE + "px " + cs.fontFamily;
      const m = ctx.measureText(span.textContent);
      const left = m.actualBoundingBoxLeft || 0;            // ink left of origin
      const overhang = (m.actualBoundingBoxRight || m.width) - m.width; // ink past last advance
      const inkW = w - ls + overhang + left;                // last letter has no spacing after it
      const scale = target / (inkW > 0 ? inkW : w);
      h.style.fontSize = (BASE * scale) + "px";
      span.style.marginLeft = (left * scale) + "px";       // first letter flush with the left edge
      // letters hanging below the baseline (p, y in philosophy) eat into the
      // space above the paragraph - push the paragraph down by that much so
      // every word gets the same visible gap
      const descent = Math.max(0, m.actualBoundingBoxDescent || 0) * scale;
      const para = h.parentElement.querySelectorAll(".reveal-panel p");
      para.forEach(function (p) { p.style.paddingTop = ""; });
      if (para[0]) {
        const basePad = parseFloat(getComputedStyle(para[0]).paddingTop) || 0;
        para[0].style.paddingTop = (basePad + descent) + "px";
      }
    });
  }

  // big "contact" in box 4: letters run from the top edge to the bottom edge
  const contact = document.getElementById("contactLink");
  function fitContact() {
    if (!contact) return;
    const box = contact.closest(".contact-block");
    const H = box.clientHeight;
    if (!H) return;
    const cs = getComputedStyle(contact);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = cs.fontWeight + " 100px " + cs.fontFamily;
    const ascent = ctx.measureText(contact.textContent).actualBoundingBoxAscent;
    if (!ascent) return;
    contact.style.fontSize = (100 * H / ascent) + "px";
    contact.style.top = "0px";
    // put the baseline on the bottom edge
    const marker = document.createElement("span");
    marker.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    contact.appendChild(marker);
    const baseline = marker.getBoundingClientRect().top;
    marker.remove();
    contact.style.top = (box.getBoundingClientRect().bottom - baseline) + "px";
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(fit).observe(stack);
  } else {
    window.addEventListener("resize", fit);
  }
  window.addEventListener("resize", fitContact);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fit(); fitContact(); });
  fit();
  fitContact();
})();
