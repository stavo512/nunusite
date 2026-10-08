(function () {
  "use strict";

  const QUEUE_SIZE = 4;
  const DUR_MS = 520; // keep in sync with --dur in style.css

  const focusStage = document.getElementById("focusStage");
  // only the media box changes width; the mode switch above it stays put
  const sizeTarget = focusStage;
  const queueStage = document.getElementById("queueStage");
  const stageRow = document.querySelector(".stage-row");
  // whatever wraps #carousel - relied on for a stable width to cap
  // against, since the stage row's own width isn't trustworthy (it's
  // partly driven by focus-stage's own current, possibly-stale width)
  const stageContainer = document.getElementById("carousel").parentElement;

  const state = {
    catIndex: 0,
    itemIndex: 0
  };

  let busy = false;

  // shuffle every area's media on each page load, so the order is
  // different every visit (media.js itself stays untouched)
  MEDIA.categories.forEach(function (cat) {
    const a = cat.items;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
  });

  // ---- caption under the media ----------------------------------------
  // hides straight away when the media changes, then fades in 0.75s after
  // the new media has loaded
  const CAPTION_DELAY_MS = 750;
  const captionEl = document.getElementById("mediaCaption");
  let captionTimer = null;
  let captionToken = 0;
  function whenReady(media, cb) {
    if (!media) return cb();
    const isVideo = media.tagName === "VIDEO";
    const ready = isVideo ? media.readyState >= 2 : (media.complete && media.naturalWidth);
    if (ready) return cb();
    media.addEventListener(isVideo ? "loadeddata" : "load", cb, { once: true });
    media.addEventListener("error", cb, { once: true });
  }
  function showCaption(item, media) {
    if (!captionEl) return;
    const token = ++captionToken;
    clearTimeout(captionTimer);
    captionEl.classList.remove("is-shown");
    const text = (item && item.caption) || "";
    if (!text) return;
    whenReady(media, function () {
      if (token !== captionToken) return; // media changed again meanwhile
      captionTimer = setTimeout(function () {
        if (token !== captionToken) return;
        captionEl.textContent = text;
        captionEl.classList.add("is-shown");
      }, CAPTION_DELAY_MS);
    });
  }

  // random loading animation from loading/ (listed in media.js).
  // They're tiny, so fetch them all up front - that way a loader is ready
  // instantly even when the connection is slow.
  const loaderCache = {};
  ((window.MEDIA && MEDIA.loaders) || []).forEach(function (src) {
    if (!window.fetch) return;
    fetch(src).then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) { if (b) loaderCache[src] = URL.createObjectURL(b); })
      .catch(function () {}); // opened as a local file: just use the path
  });
  function randomLoader() {
    const list = (window.MEDIA && MEDIA.loaders) || [];
    if (!list.length) return null;
    const src = list[Math.floor(Math.random() * list.length)];
    return loaderCache[src] || src;
  }

  function currentCategory() {
    return MEDIA.categories[state.catIndex];
  }

  // item at (current position + offset), wrapping around the category
  function itemAt(offset) {
    const items = currentCategory().items;
    if (!items.length) return null;
    const i = ((state.itemIndex + offset) % items.length + items.length) % items.length;
    return items[i];
  }

  // how many thumbnails the queue shows: never the one that's in focus,
  // so with few items the queue is shorter
  function queueCount() {
    return Math.max(0, Math.min(QUEUE_SIZE, currentCategory().items.length - 1));
  }
  function queueGap() {
    const t = document.getElementById("queueTrack");
    return t ? (parseFloat(getComputedStyle(t).rowGap) || 0) : 0;
  }

  function createMediaEl(item, opts) {
    opts = opts || {};
    let el;
    if (item.type === "video") {
      el = document.createElement("video");
      // queue thumbnails: jump a hair in so a real frame shows, not black
      el.src = opts.queueThumb ? item.src + "#t=0.1" : item.src;
      el.muted = true;
      el.loop = true;
      el.playsInline = true;
      el.preload = opts.queueThumb ? "metadata" : "auto";
      if (opts.autoplay) {
        el.autoplay = true;
        el.play().catch(function () {});
      }
    } else {
      el = document.createElement("img");
      el.src = item.src;
      el.alt = item.alt || "";
      if (!opts.autoplay) el.loading = "lazy";
    }
    return el;
  }

  function createFrame(item) {
    const frame = document.createElement("div");
    frame.className = "frame";
    const media = createMediaEl(item, { autoplay: true });
    frame.appendChild(media);
    frame._media = media;
    addLoader(frame, media);
    return frame;
  }

  // shows a random loading animation in the middle of the frame until the
  // media is ready to show, then removes it
  function addLoader(frame, media) {
    const ready = media.tagName === "VIDEO"
      ? media.readyState >= 2
      : (media.complete && media.naturalWidth);
    if (ready) return;
    const src = randomLoader();
    if (!src) return;
    const ld = document.createElement("video");
    ld.className = "loader";
    ld.src = src;
    ld.muted = true;
    ld.loop = true;
    ld.autoplay = true;
    ld.playsInline = true;
    ld.setAttribute("aria-hidden", "true");
    ld.play().catch(function () {});
    frame.appendChild(ld);
    media.classList.add("is-loading");
    function done() {
      media.classList.remove("is-loading");
      ld.classList.add("is-done");
      setTimeout(function () { ld.remove(); }, 300);
    }
    media.addEventListener(media.tagName === "VIDEO" ? "loadeddata" : "load", done, { once: true });
  }

  function createQueueItem(item) {
    const wrap = document.createElement("div");
    wrap.className = "queue-item";
    const media = createMediaEl(item, { queueThumb: true });
    wrap.appendChild(media);
    return wrap;
  }

  // sets focus-stage width to match the media's aspect ratio at the
  // stage's fixed height. animate=false snaps instantly (first render,
  // resize); animate=true lets the CSS transition run (on advance).
  function sizeFocusStage(frame, animate) {
    const stageH = focusStage.getBoundingClientRect().height || 1;
    const media = frame._media;

    function apply(w, h) {
      const ratio = w && h ? w / h : 1.5;
      let targetW = Math.round(stageH * ratio);
      // never let the focus box push the queue off-screen or blow out
      // the page on an extreme aspect ratio - cap to available width.
      // measured against stageContainer (stable) rather than stageRow
      // (whose own width is partly driven by focus-stage's current,
      // possibly-stale width - that self-reference was the bug).
      const containerStyle = getComputedStyle(stageContainer);
      const containerInner = stageContainer.clientWidth
        - parseFloat(containerStyle.paddingLeft || 0)
        - parseFloat(containerStyle.paddingRight || 0);
      const gapPx = parseFloat(getComputedStyle(stageRow).gap) || 0;
      const indent = parseFloat(getComputedStyle(focusStage).marginLeft) || 0;
      const available = containerInner - queueStage.getBoundingClientRect().width - gapPx - indent;
      if (available > 0) targetW = Math.min(targetW, Math.round(available));
      if (!animate) {
        sizeTarget.style.transition = "none";
        sizeTarget.style.width = targetW + "px";
        void sizeTarget.offsetWidth; // reflow
        sizeTarget.style.transition = "";
      } else {
        sizeTarget.style.width = targetW + "px";
      }
    }

    if (media.tagName === "IMG") {
      if (media.complete && media.naturalWidth) {
        apply(media.naturalWidth, media.naturalHeight);
      } else {
        media.addEventListener("load", function () {
          apply(media.naturalWidth, media.naturalHeight);
        }, { once: true });
      }
    } else {
      if (media.readyState >= 1 && media.videoWidth) {
        apply(media.videoWidth, media.videoHeight);
      } else {
        media.addEventListener("loadedmetadata", function () {
          apply(media.videoWidth, media.videoHeight);
        }, { once: true });
      }
    }
  }

  function render() {
    focusStage.innerHTML = "";
    queueStage.innerHTML = "";

    const items = currentCategory().items;

    if (!items.length) {
      showCaption(null, null);
      focusStage.innerHTML = '<div class="focus-empty">Add media to this category</div>';
      queueStage.innerHTML = '<div class="queue-empty">&mdash;</div>';
      return;
    }

    const focusItem = itemAt(0);
    const frame = createFrame(focusItem);
    showCaption(focusItem, frame._media);
    frame.classList.add("in-place");
    focusStage.appendChild(frame);
    sizeFocusStage(frame, false);

    const track = document.createElement("div");
    track.className = "queue-track";
    track.id = "queueTrack";
    for (let i = 1; i <= queueCount(); i++) {
      track.appendChild(createQueueItem(itemAt(i)));
    }
    queueStage.appendChild(track);
  }

  // dir: 1 = forward (right/down), -1 = backward (left/up)
  function step(dir) {
    if (busy) return;
    const items = currentCategory().items;
    if (items.length < 2) return; // nothing to advance to
    busy = true;

    const oldFrame = focusStage.querySelector(".frame");
    const queueTrack = document.getElementById("queueTrack");

    const newItem = itemAt(dir);
    const newFrame = createFrame(newItem);
    showCaption(newItem, newFrame._media);
    newFrame.classList.add(dir > 0 ? "enter-from-top" : "exit-down");
    focusStage.appendChild(newFrame);
    sizeFocusStage(newFrame, true);

    void newFrame.offsetWidth; // reflow so the starting transform registers

    requestAnimationFrame(function () {
      oldFrame.classList.remove("in-place");
      oldFrame.classList.add(dir > 0 ? "exit-down" : "enter-from-top");
      newFrame.classList.remove("enter-from-top", "exit-down");
      newFrame.classList.add("in-place");
    });

    let shiftPx = 0;
    if (queueTrack) {
      if (dir > 0) {
        // moving forward: the item that just left the queue is now in
        // focus, so drop the queue's first thumbnail and add a new one
        // at the bottom, then scroll the whole track up by one slot.
        const first = queueTrack.firstElementChild;
        if (first) shiftPx = first.getBoundingClientRect().height + queueGap();
        const incoming = itemAt(queueCount() + 1);
        if (incoming) queueTrack.appendChild(createQueueItem(incoming));
        requestAnimationFrame(function () {
          queueTrack.style.transform = "translateY(-" + shiftPx + "px)";
        });
      } else {
        // moving backward: mirror image - insert a new thumbnail at the
        // top (off-screen), then scroll the track down into place.
        // the item that was in focus goes back to the top of the queue
        const incoming = itemAt(0);
        const newTop = incoming ? createQueueItem(incoming) : null;
        if (newTop) {
          queueTrack.insertBefore(newTop, queueTrack.firstElementChild);
          shiftPx = newTop.getBoundingClientRect().height + queueGap();
          queueTrack.style.transition = "none";
          queueTrack.style.transform = "translateY(-" + shiftPx + "px)";
          void queueTrack.offsetWidth;
          queueTrack.style.transition = "";
          requestAnimationFrame(function () {
            queueTrack.style.transform = "translateY(0)";
          });
        }
        const last = queueTrack.children[queueCount()];
        if (last) last.remove();
      }
    }

    setTimeout(function () {
      oldFrame.remove();
      if (queueTrack && dir > 0) {
        queueTrack.style.transition = "none";
        queueTrack.style.transform = "translateY(0)";
        if (queueTrack.firstElementChild) queueTrack.firstElementChild.remove();
        void queueTrack.offsetWidth;
        queueTrack.style.transition = "";
      }
      state.itemIndex = ((state.itemIndex + dir) % items.length + items.length) % items.length;
      busy = false;
    }, DUR_MS + 30);
  }

  // Category switching (currently unused - the toggle UI is off for now).
  // Re-wire this to a button/key later to flip categories again.
  function switchCategory(dir) {
    if (busy) return;
    state.catIndex = (state.catIndex + dir + MEDIA.categories.length) % MEDIA.categories.length;
    state.itemIndex = 0;
    // fade only the media boxes - the mode switch stays solid
    const fading = [focusStage, queueStage];
    fading.forEach(function (el) {
      el.style.transition = "opacity .22s ease";
      el.style.opacity = "0";
    });
    setTimeout(function () {
      render();
      fading.forEach(function (el) { el.style.opacity = "1"; });
    }, 200);
  }

  // used by the on-screen arrows in mode-switch.js
  window.stepMedia = step;

  // used by mode-switch.js: jump straight to a category by its id
  window.setMediaCategory = function (id) {
    const i = MEDIA.categories.findIndex(function (c) { return c.id === id; });
    if (i < 0 || i === state.catIndex) return;
    if (busy) { setTimeout(function () { window.setMediaCategory(id); }, 120); return; }
    switchCategory(i - state.catIndex);
  };

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    }
  });

  let resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      const frame = focusStage.querySelector(".frame.in-place");
      if (frame) sizeFocusStage(frame, false);
    }, 100);
  });

  render();
})();
