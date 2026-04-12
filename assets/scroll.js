/* ============================================================
   MANIFESTO SCROLL CONTROLLER
   Three-stage snap per section:
     stage 1 — content slides up from below
     stage 2 — hw slides up from below
     stage 3 — dwell, both held at rest before advancing
   No opacity animation; pure translateY.
   Vanilla JS, rAF-driven. No dependencies.
   ============================================================ */
(function () {
  const prefersReduced =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const wrappers = Array.from(document.querySelectorAll('.snap-wrapper'));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isMobile = () => window.innerWidth <= 600;

  function rotFor(hw) {
    const rot = parseFloat(
      getComputedStyle(hw).getPropertyValue('--hw-rot')
    ) || 0;
    return isMobile() ? rot * 3 : rot;
  }

  function checkOverflow() {
    wrappers.forEach((w) => {
      const content = w.querySelector('.content-cols');
      if (!content) return;
      const VH = window.innerHeight;
      const overflow = content.scrollHeight > VH - 80;
      w.classList.toggle('snap--scrollable', overflow);
    });
  }

  function update() {
    const VH = window.innerHeight;

    wrappers.forEach((w) => {
      const rect = w.getBoundingClientRect();
      const content = w.querySelector('.content-cols');
      const hws = w.querySelectorAll('.hw');
      if (!content) return;

      if (prefersReduced) {
        content.style.transform = 'none';
        hws.forEach((hw) => {
          hw.style.transform = `rotate(${rotFor(hw)}deg)`;
        });
        return;
      }

      // Wrapper is 200vh with two snap stops.
      //   Stage 1 (rect.top: VH → 0): content rises in as section enters.
      //   Stage 1 snap rest (rect.top=0): content at rest, hw below.
      //   Stage 2 (rect.top: 0 → -VH): hw rises in while section pinned.
      //   Stage 2 snap rest: both at rest. Next scroll advances to next section.
      let pContent, pHw;
      if (w.classList.contains('snap--scrollable')) {
        const h = w.offsetHeight;
        const p = clamp((VH - rect.top) / (h + VH), 0, 1) * 2;
        pContent = clamp(p, 0, 1);
        pHw = clamp(p - 1, 0, 1);
      } else {
        pContent = clamp(1 - rect.top / VH, 0, 1);
        pHw = clamp(-rect.top / VH, 0, 1);
      }

      // Content enters from below the viewport.
      const contentRise = VH * 0.55;
      content.style.transform =
        `translateY(${((1 - pContent) * contentRise).toFixed(1)}px)`;

      // HW enters from below. Distance depends on anchor row so
      // the callout starts fully below the viewport regardless of
      // whether it anchors at top / middle / bottom.
      hws.forEach((hw) => {
        // Spreadsheet coords: "A1".."C3". Second char is row (1/2/3).
        const pos = (hw.dataset.hwPos || 'A3').toUpperCase();
        const row = pos[1];
        const rise =
          row === '1' ? VH * 1.1 :
          row === '2' ? VH * 0.9 :
                        VH * 1.1;
        const rot = rotFor(hw);
        hw.style.transform =
          `translateY(${((1 - pHw) * rise).toFixed(1)}px) rotate(${rot}deg)`;
      });
    });
  }

  let rafId = 0;
  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      update();
    });
  }

  function tick() {
    checkOverflow();
    update();
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', tick, { passive: true });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(tick);
  }
  tick();

  /* ----------------------------------------------------------
     FIXED FRAME: date + section label + active dot
     ---------------------------------------------------------- */
  (function frame() {
    const dateEl = document.querySelector('[data-date]');
    if (dateEl) {
      const d = new Date();
      dateEl.textContent = d
        .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        .toUpperCase();
    }

    const labelEl = document.querySelector('[data-current-section]');
    const dotsEl = document.querySelector('[data-dots]');
    const tracked = Array.from(
      document.querySelectorAll('.snap-wrapper[data-section-name]')
    );
    if (!tracked.length) return;

    if (dotsEl) {
      tracked.forEach((_, i) => {
        const li = document.createElement('li');
        li.dataset.idx = String(i);
        dotsEl.appendChild(li);
      });
    }
    const dots = dotsEl ? dotsEl.querySelectorAll('li') : [];

    function setActive(idx) {
      const w = tracked[idx];
      if (!w) return;
      if (labelEl) labelEl.textContent = w.dataset.sectionName || '';
      dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
    }

    const io = new IntersectionObserver(
      (entries) => {
        let best = null;
        entries.forEach((e) => {
          if (e.isIntersecting) {
            if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
          }
        });
        if (best) {
          const idx = tracked.indexOf(best.target);
          if (idx >= 0) setActive(idx);
        }
      },
      { threshold: [0.25, 0.5, 0.75] }
    );
    tracked.forEach((w) => io.observe(w));
    setActive(0);
  })();
})();
