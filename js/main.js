/* ============================================================
   NORTHFIELD & CO — MAIN.JS
   Modular vanilla JS: each feature is an isolated init function.
   ============================================================ */

/* ---------------- Performance tier detection ----------------
   Low-end / older devices were visibly janky on the Hero's sticky
   scroll-zoom transition and on Lenis's smooth-scroll rAF loop —
   heavy on CPUs with few cores or on machines already under load.
   This runs first, before anything else, and adds .perf-lite to
   <html> when the device looks too weak to carry those effects
   smoothly. Every other init function (and style.css) checks for
   that class and swaps to a lighter/instant version instead of a
   separate "disable everything" switch — normal scroll reveals,
   hover states, etc. still run exactly as before.

   Two signals are combined:
   1) Static device hints (CPU core count, device memory, a
      save-data / slow network hint) — cheap, synchronous, and a
      decent first guess.
   2) A short real frame-time sample taken via requestAnimationFrame
      right at page load. This catches machines that pass the static
      checks (e.g. 4+ cores) but are still slow in practice (thermal
      throttling, background load, an old GPU) — and also catches
      the opposite (a low core-count but otherwise fast machine).
   Whichever signal fires first applies .perf-lite; nothing here
   removes it once applied, and it only ever runs once. ---------------- */
function initPerfDetection() {
  const root = document.documentElement;
  if (root.classList.contains('perf-lite')) return; // already decided

  function enableLiteMode() {
    root.classList.add('perf-lite');
  }

  // ---- Static device hints ----
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory; // GB, undefined on many browsers
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const slowNetwork = connection && (connection.saveData || /^(slow-2g|2g|3g)$/.test(connection.effectiveType || ''));

  if (cores <= 2 || (memory && memory <= 2) || slowNetwork) {
    enableLiteMode();
    return; // strong enough signal on its own — skip the frame sample
  }

  // ---- Real frame-time sample ----
  // Measures actual frame gaps for ~600ms right at load. A healthy
  // 60Hz display keeps frames close to ~16.7ms; a struggling device
  // (or one already busy loading/parsing the rest of the page) shows
  // up as noticeably longer average gaps. Runs once, self-stops, and
  // costs nothing after its window closes.
  const SAMPLE_MS = 600;
  const JANK_THRESHOLD_MS = 27; // ~2 dropped frames' worth on a 60Hz display
  let lastTime = null;
  let totalGap = 0;
  let frameCount = 0;
  let startTime = null;

  function sample(time) {
    if (startTime === null) startTime = time;
    if (lastTime !== null) {
      totalGap += time - lastTime;
      frameCount += 1;
    }
    lastTime = time;

    if (time - startTime < SAMPLE_MS) {
      requestAnimationFrame(sample);
      return;
    }

    const avgGap = frameCount > 0 ? totalGap / frameCount : 0;
    if (avgGap > JANK_THRESHOLD_MS) {
      enableLiteMode();
    }
  }

  requestAnimationFrame(sample);
}

document.addEventListener('DOMContentLoaded', () => {
  initPerfDetection();
  initSmoothScroll();
  initHeaderScroll();
  initMobileMenu();
  initActiveNav();
  initScrollReveal();
  initCounters();
  initProcessSteps();
  initPortfolioFilter();
  initContactForm();
  initPageTransitions();
  initHeroParallax();
  initHeroServicesTransition();
  initLogoReveal();
  initCardParallax();
  initFAQ();
  initServiceModal();
  initSolutionSelector();
  initGoodToKnow();
  initSvcSubnavActive();
});

/* ---------------- Smooth scroll (Lenis) ----------------
   Buttery-smooth inertia scrolling for desktop mouse-wheel users.
   Deliberately OFF on touch devices: Lenis's syncTouch mode re-simulates
   scrolling by hand in JS on every touchmove, which feels noticeably
   heavier/laggier than the browser's native, GPU-composited touch
   scrolling — mobile is faster and smoother left alone. Also falls back
   silently to native scrolling if Lenis fails to load (e.g. offline /
   CDN blocked) or if the user has prefers-reduced-motion enabled. ---------------- */
function initSmoothScroll() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  if (isTouch) return; // let mobile use native touch scrolling — it's faster
  if (document.documentElement.classList.contains('perf-lite')) return; // low-end device — native scroll is lighter
  if (typeof Lenis === 'undefined') return; // CDN not loaded — native scroll still works fine

  let lenis = null;
  let rafId = null;

  function raf(time) {
    lenis.raf(time);
    rafId = requestAnimationFrame(raf);
  }

  function create() {
    lenis = new Lenis({
      duration: 0.5,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      wheelMultiplier: 1,
    });
    window.__lenis = lenis;
    rafId = requestAnimationFrame(raf);
  }

  create();

  // Lenis.stop() only pauses its scroll updates — it keeps its wheel
  // listener attached on the document and still intercepts/preventDefaults
  // wheel events, which is what made scrolling inside the modal feel
  // sluggish/slow-motion. Fully destroying it (and recreating it on close)
  // removes those listeners so the modal gets 100% native wheel scrolling.
  window.__lenisSuspend = () => {
    if (rafId) cancelAnimationFrame(rafId);
    if (lenis) { lenis.destroy(); lenis = null; window.__lenis = null; }
  };
  window.__lenisResume = () => {
    if (!lenis) create();
  };

  // Keep in-page anchor links (e.g. nav "#services") working smoothly
  // through Lenis instead of the browser's native jump/CSS smooth-scroll.
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      if (window.__lenis) window.__lenis.scrollTo(target, { offset: -84 }); // offset for fixed header height
    });
  });
}

/* ---------------- Service cards: subtle internal visual parallax ---------------- */
function initCardParallax() {
  const cards = document.querySelectorAll('.service-card');
  if (!cards.length) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  if (prefersReducedMotion || isTouch) return;

  const MAX_MOVE = 6; // px

  cards.forEach(card => {
    const visual = card.querySelector('[data-parallax-el]');
    if (!visual) return;

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - 0.5;
      visual.style.transform = `translateX(${relX * MAX_MOVE * 2}px)`;
    });

    card.addEventListener('mouseleave', () => {
      visual.style.transform = '';
    });
  });
}

/* ---------------- Header scroll state ---------------- */
function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const setState = () => {
    if (window.scrollY > 12) header.classList.add('is-scrolled');
    else header.classList.remove('is-scrolled');
  };
  setState();
  window.addEventListener('scroll', setState, { passive: true });
}

/* ---------------- Mobile nav panel ---------------- */
function initMobileMenu() {
  const btn = document.querySelector('.hamburger');
  const panel = document.querySelector('.mobile-panel');
  if (!btn || !panel) return;

  const open = () => {
    panel.classList.add('is-open');
    btn.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
  };
  const close = () => {
    panel.classList.remove('is-open');
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  };

  btn.addEventListener('click', () => {
    panel.classList.contains('is-open') ? close() : open();
  });

  panel.querySelectorAll('a').forEach(link => {
    // Deliberately not closed synchronously on click: closing immediately
    // removes .is-open (and its pointer-events) from the panel mid-click,
    // which on some mobile browsers can cause the same click to be dropped
    // before the page-transition/navigation listener (in initPageTransitions)
    // gets to handle it — the link never actually navigates. A microtask-
    // delay close lets navigation fire first.
    link.addEventListener('click', () => setTimeout(close, 0));
  });

  document.addEventListener('click', (e) => {
    if (panel.classList.contains('is-open') &&
        !panel.contains(e.target) &&
        !btn.contains(e.target)) {
      close();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) close();
  });
}

/* ---------------- Active nav highlighting ---------------- */
function initActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a, .mobile-panel nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

/* ---------------- Scroll reveal via IntersectionObserver ---------------- */
function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  items.forEach((el, i) => {
    const group = el.closest('[data-stagger-group]');
    if (group) {
      const index = Array.from(group.querySelectorAll('.reveal')).indexOf(el);
      el.style.setProperty('--stagger-delay', `${index * 90}ms`);
    }
    observer.observe(el);
  });
}

/* ---------------- Animated counters ---------------- */
function initCounters() {
  const counters = document.querySelectorAll('[data-counter]');
  if (!counters.length) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const animate = (el) => {
    const target = parseFloat(el.dataset.counter);
    const suffix = el.dataset.suffix || '';
    if (prefersReduced) {
      el.textContent = target + suffix;
      return;
    }
    const duration = 1400;
    const start = performance.now();

    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      el.textContent = value + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animate(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });

  counters.forEach(el => observer.observe(el));
}

/* ---------------- Process steps (click to pin active on touch) ---------------- */
function initProcessSteps() {
  const steps = document.querySelectorAll('.process-step');
  if (!steps.length) return;

  steps.forEach(step => {
    step.addEventListener('click', () => {
      steps.forEach(s => s.classList.remove('is-active'));
      step.classList.add('is-active');
    });
  });
}

/* ---------------- Testimonial rotator ----------------
   Rendering + data-fetching now lives in js/testimonials-public.js,
   which fetches from /api/testimonials (admin-managed) instead of the
   hardcoded data-slides markup this used to read. See that file for
   the render/rotate logic. */

/* ---------------- Portfolio filtering ---------------- */
function initPortfolioFilter() {
  const bar = document.querySelector('.filter-bar');
  const items = document.querySelectorAll('.portfolio-item');
  if (!bar || !items.length) return;

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;

    bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');

    const filter = btn.dataset.filter;

    items.forEach(item => {
      const matches = filter === 'all' || item.dataset.category === filter;
      if (matches) {
        item.classList.remove('is-hidden');
      } else {
        item.classList.add('is-hidden');
      }
    });
  });
}

/* ---------------- Contact form validation ---------------- */
function initContactForm() {
  const form = document.querySelector('.contact-form');
  if (!form) return;

  const success = document.querySelector('.form-success');

  // Preselect the service dropdown when arriving via ?service=slug
  // (e.g. from a service modal's "Let's Talk About This Service" CTA).
  const serviceField = form.querySelector('#service');
  if (serviceField) {
    const requestedService = new URLSearchParams(window.location.search).get('service');
    if (requestedService && [...serviceField.options].some(opt => opt.value === requestedService)) {
      serviceField.value = requestedService;
    }
  }

  const validators = {
    name: (v) => v.trim().length >= 2 || 'Please enter your full name.',
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Enter a valid email address.',
    service: (v) => v !== '' || 'Please select a service.',
    message: (v) => v.trim().length >= 20 || 'Tell us a bit more — at least 20 characters.'
  };

  const showError = (field, message) => {
    const wrap = field.closest('.field');
    wrap.classList.add('has-error');
    const errorEl = wrap.querySelector('.field-error');
    if (errorEl) errorEl.textContent = message;
  };

  const clearError = (field) => {
    const wrap = field.closest('.field');
    wrap.classList.remove('has-error');
  };

  const validateField = (field) => {
    const rule = validators[field.name];
    if (!rule) return true;
    const result = rule(field.value);
    if (result === true) {
      clearError(field);
      return true;
    }
    showError(field, result);
    return false;
  };

  form.querySelectorAll('input, select, textarea').forEach(field => {
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('input', () => {
      if (field.closest('.field').classList.contains('has-error')) validateField(field);
    });
  });

  // Phase 4: wired to the Scale To Sky Super Admin backend's public lead
  // creation endpoint. The Super Admin backend serves both the admin app
  // and this public API from the same origin in dev; when this static
  // site is hosted separately, set window.STSK_API_BASE (e.g. in a small
  // inline <script> before this file) to the backend's origin. Left
  // empty, requests are same-origin relative paths — same convention as
  // js/portfolio-public.js.
  const API_BASE = window.STSK_API_BASE || '';

  const submitBtn = form.querySelector('button[type="submit"]');
  const submitBtnLabel = submitBtn ? submitBtn.querySelector('.submit-btn-label') : null;
  const submitError = form.querySelector('.form-submit-error');

  const setSubmitting = (isSubmitting) => {
    if (!submitBtn) return;
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle('is-loading', isSubmitting);
    if (submitBtnLabel) submitBtnLabel.textContent = isSubmitting ? 'Sending...' : 'Send Inquiry';
  };

  const showSubmitError = (message) => {
    if (!submitError) return;
    submitError.textContent = message;
    submitError.classList.add('is-visible');
  };

  const clearSubmitError = () => {
    if (!submitError) return;
    submitError.textContent = '';
    submitError.classList.remove('is-visible');
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fields = form.querySelectorAll('input[name], select[name], textarea[name]');
    let isValid = true;
    fields.forEach(field => {
      if (validators[field.name] && !validateField(field)) isValid = false;
    });

    if (!isValid) {
      form.querySelector('.has-error input, .has-error select, .has-error textarea')?.focus();
      return;
    }

    clearSubmitError();
    setSubmitting(true);

    const formData = Object.fromEntries(new FormData(form));

    try {
      const response = await fetch(`${API_BASE}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name || '',
          email: formData.email || '',
          company: formData.company || '',
          service: formData.service || '',
          message: formData.message || '',
        }),
      });

      let data = null;
      try { data = await response.json(); } catch { /* no body */ }

      if (!response.ok || !data || !data.success) {
        showSubmitError((data && data.message) || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      form.classList.add('is-submitted');
      success.classList.add('is-visible');
      success.setAttribute('tabindex', '-1');
      success.focus();
      form.reset();

      // Analytics: fires only on a real, successful lead submission —
      // never includes the visitor's name/email/message (see
      // js/analytics.js — contact_form_submit carries no metadata).
      if (window.STSKAnalytics) window.STSKAnalytics.trackContactFormSubmit();
    } catch (networkErr) {
      showSubmitError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  });
}

/* ---------------- Subtle page transition ---------------- */
function initPageTransitions() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; background: var(--white, #fff);
    z-index: 9999; opacity: 0; pointer-events: none;
    transition: opacity 220ms ease;
  `;
  document.body.appendChild(overlay);

  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 280ms ease';
  requestAnimationFrame(() => { document.body.style.opacity = '1'; });
  // Safety net: on some mobile browsers requestAnimationFrame can be
  // delayed or dropped entirely (background tab, low-power throttling,
  // in-app browser quirks). If the fade-in rAF never runs, the whole
  // page stays invisible/opacity:0 — taps still register but nothing
  // looks clickable so it feels broken. Force full opacity shortly
  // after load no matter what.
  setTimeout(() => { document.body.style.opacity = '1'; }, 400);

  // Delegated listener: works for links present at load AND links added
  // later (e.g. blog CTA buttons injected async by blog.js).
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href$=".html"]:not([target="_blank"])');
    if (!link) return;

    const url = link.getAttribute('href');
    const currentFile = window.location.pathname.split('/').pop() || 'index.html';
    const linkFile = url.split('/').pop();
    const isSamePage = linkFile === currentFile;
    // Skip the fade for modified clicks (open in new tab/window), downloads,
    // or a same-page link — let the browser handle those natively.
    if (isSamePage || link.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    e.preventDefault();
    overlay.style.pointerEvents = 'auto';
    overlay.style.opacity = '1';

    let navigated = false;
    const go = () => {
      if (navigated) return;
      navigated = true;
      window.location.href = url;
    };
    // Safety net: if the fade transition never completes (backgrounded tab,
    // in-app browser throttling, etc.), force navigation anyway so the tap
    // is never silently swallowed.
    setTimeout(go, 120);
    setTimeout(go, 600);
  });

  // Safety net: if this page is restored from the back-forward cache
  // (e.g. user taps back after a CTA click), the overlay/body opacity
  // can be frozen mid-transition from before navigation, making the
  // whole page look faded out and eating clicks via pointer-events.
  // Reset everything so the restored page is immediately interactive.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = '0';
    document.body.style.opacity = '1';
  });
}

/* ---------------- Hero: subtle mouse parallax on ecosystem cards ---------------- */
function initHeroParallax() {
  const hero = document.querySelector('.hero');
  const cards = document.querySelectorAll('.hero-ecosystem [data-parallax]');
  if (!hero || !cards.length) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  if (prefersReducedMotion || isTouch) return;
  if (document.documentElement.classList.contains('perf-lite')) return; // low-end device — skip continuous mousemove work

  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;

    cards.forEach(card => {
      const strength = parseFloat(card.dataset.parallax) || 4;
      const x = relX * strength * 2;
      const y = relY * strength * 2;
      card.style.setProperty('--px', `${x}px`);
      card.style.setProperty('--py', `${y}px`);
    });
  });

  hero.addEventListener('mouseleave', () => {
    cards.forEach(card => {
      card.style.setProperty('--px', '0px');
      card.style.setProperty('--py', '0px');
    });
  });
}

/* ---------------- Hero → Services layered scroll transition ----------------
   Home page only. Drives a single CSS custom property, --hst-progress
   (0 → 1), on .hero-scroll-wrapper as the user scrolls through it. The
   Hero is sticky-pinned via CSS (see style.css) while the Services
   section — opaque white, higher z-index — translates up over it.
   CSS reads --hst-progress for the actual transform/opacity math, so
   this function only ever computes and writes one number per frame.

   Reuses window.__lenis (from initSmoothScroll) for scroll position
   when available so both systems stay in sync; falls back to native
   window.scrollY otherwise. No second scroll-smoothing system, no
   extra scroll listeners — position is sampled inside a single rAF
   loop that only runs while the wrapper is near the viewport. ---------------- */
function initHeroServicesTransition() {
  const wrapper = document.querySelector('.hero-scroll-wrapper');
  const hero = wrapper && wrapper.querySelector('.hero');
  const cover = wrapper && wrapper.querySelector('.hero-scroll-cover');
  if (!wrapper || !hero || !cover) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return; // CSS reduced-motion block also guards this, but skip the rAF loop entirely

  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  if (isMobile) return; // simplified, non-sticky mobile experience per spec — plain stacked sections

  if (document.documentElement.classList.contains('perf-lite')) return; // low-end device — plain stacked sections, no sticky-pin/scale/filter rAF loop

  wrapper.classList.add('hst-active');

  // Distance (px) over which the transition completes, measured from the
  // top of the wrapper. Tied to the Hero's own height so it scales with
  // viewport/content rather than a hardcoded pixel value, and capped so
  // it's never an unnecessarily long pinned section. Lowered from
  // hero-height*0.85 (max 900px) to hero-height*0.45 (max 500px) — the
  // longer distance meant the Hero stayed sticky-pinned (visually static
  // while only scaling/fading) for a large chunk of scroll input, which
  // read as the page "slowing down" compared to normal sections where
  // content displaces per scroll unit. Shorter distance = same wheel
  // input completes the transition sooner and normal scrolling resumes.
  let travelDistance = Math.min(hero.offsetHeight * 0.45, 500);
  let wrapperTop = 0;
  let running = false;
  let rafId = null;
  // displayedProgress lerps toward targetProgress every frame instead of
  // jumping straight to the raw scroll-derived value. Combined with the
  // short CSS transition on the transform itself, this removes the
  // step-y/jerky feel of the zoom on fast or trackpad scrolling, without
  // making the effect noticeably lag behind the actual scroll position.
  let displayedProgress = 0;
  let targetProgress = 0;

  function measure() {
    // getBoundingClientRect + scroll position combine to give an
    // absolute offset without depending on a specific scroll container.
    const rect = wrapper.getBoundingClientRect();
    wrapperTop = rect.top + (window.__lenis ? window.__lenis.scroll : window.scrollY);
    travelDistance = Math.min(hero.offsetHeight * 0.45, 500);
  }

  function currentScroll() {
    return window.__lenis ? window.__lenis.scroll : window.scrollY;
  }

  function computeTarget() {
    const y = currentScroll();
    const raw = (y - wrapperTop) / travelDistance;
    const clamped = Math.min(Math.max(raw, 0), 1);
    // Ease-out so the motion is brisk at first and settles gently into
    // place, rather than a mechanical linear rise.
    targetProgress = 1 - Math.pow(1 - clamped, 2);
  }

  function frame() {
    computeTarget();
    // Lerp toward the target each frame. The CSS transition on the
    // transform properties has been removed entirely — it was adding a
    // second layer of scroll-response delay on top of this lerp, which
    // is what made the Hero→Services zone feel slower than the rest of
    // the page even after the lerp factor was raised. This lerp alone
    // now does all the smoothing: fast enough (0.35) to track scroll
    // closely, still enough to erase raw per-frame jitter.
    displayedProgress += (targetProgress - displayedProgress) * 0.35;
    // Snap once close enough so the value settles exactly at 0/1 instead
    // of crawling asymptotically forever.
    if (Math.abs(targetProgress - displayedProgress) < 0.0005) {
      displayedProgress = targetProgress;
    }
    wrapper.style.setProperty('--hst-progress', displayedProgress.toFixed(4));

    // Once fully settled at either end (0 or 1), stop rAF entirely rather
    // than continuing to tick every frame while the user scrolls through
    // the sections below.
    const settled = displayedProgress === targetProgress && (displayedProgress === 0 || displayedProgress === 1);
    if (running && !settled) {
      rafId = requestAnimationFrame(frame);
    } else {
      rafId = null;
      // Drop will-change once settled (see .hst-transitioning in
      // style.css). Left on permanently, the browser keeps all 8
      // transformed Hero layers GPU-composited for the rest of the
      // page's life, which is the main remaining cost while scrolling
      // through Services/Why-Different/etc — this removes it as soon
      // as the transform value stops changing.
      wrapper.classList.remove('hst-transitioning');
    }
  }

  function start() {
    if (running) return;
    running = true;
    wrapper.classList.add('hst-transitioning');
    measure();
    computeTarget();
    displayedProgress = targetProgress;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    wrapper.classList.remove('hst-transitioning');
  }

  // Restart the settled loop on scroll if progress has room to change
  // again (e.g. user scrolled back up into range) but the IO hasn't
  // fired yet. Cheap: only does work when running and currently idle.
  function onScrollWhileSettled() {
    if (running && rafId === null) {
      wrapper.classList.add('hst-transitioning');
      rafId = requestAnimationFrame(frame);
    }
  }
  window.addEventListener('scroll', onScrollWhileSettled, { passive: true });

  // Only measure/listen while the wrapper is actually near the viewport —
  // avoids any scroll work for the rest of the page's lifetime. Bottom
  // margin kept small (not 200px) since frame() now self-stops once
  // settled anyway — this just avoids a big span where IO keeps the loop
  // technically "running" (even though frame() no longer ticks) for no
  // benefit while the user is well past Services.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) start();
      else stop();
    });
  }, { rootMargin: '200px 0px 0px 0px' });
  io.observe(wrapper);

  window.addEventListener('resize', () => {
    // If the viewport is resized down into the mobile breakpoint mid-session
    // (e.g. rotating a device or resizing a desktop window), drop back to
    // the plain stacked layout rather than leaving sticky positioning
    // active at a width it wasn't designed for.
    if (window.matchMedia('(max-width: 640px)').matches) {
      stop();
      wrapper.classList.remove('hst-active');
      wrapper.style.removeProperty('--hst-progress');
      return;
    }
    if (!wrapper.classList.contains('hst-active')) {
      wrapper.classList.add('hst-active');
    }
    if (running) measure();
  }, { passive: true });
}

/* ---------------- Nav logo: brand wordmark letter-reveal ----------------
   Splits "Scale To Sky" in the nav logo into individual character spans,
   staggers a rise-from-below-the-mask animation via CSS custom properties,
   and reveals a thin baseline rule alongside it. Falls back to the plain
   static text for reduced-motion users, and can never leave it invisible
   if the split fails for any reason. ---- */
function initLogoReveal() {
  const logoText = document.querySelector('[data-logo-reveal]');
  if (!logoText) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    logoText.classList.add('is-ready');
    return;
  }

  const REPEAT_MS = 15000; // repeat the reveal animation every 15 seconds
  let charSpans = null; // cached spans so we don't rebuild the DOM every cycle

  const buildChars = () => {
    const wordEls = logoText.querySelectorAll('[data-logo-chars]');
    if (!wordEls.length) return null;

    const STEP_MS = 28;
    const WORD_GAP_MS = 50;
    let globalIndex = 0;
    const spans = [];

    wordEls.forEach(wordEl => {
      const word = wordEl.textContent;
      wordEl.textContent = '';

      Array.from(word).forEach(letter => {
        if (letter === ' ') {
          const space = document.createElement('span');
          space.className = 'logo-space';
          space.textContent = '\u00A0';
          wordEl.appendChild(space);
          return;
        }
        const span = document.createElement('span');
        span.className = 'logo-char';
        span.style.setProperty('--char-delay', `${globalIndex * STEP_MS}ms`);
        span.textContent = letter;
        wordEl.appendChild(span);
        spans.push(span);
        globalIndex += 1;
      });

      globalIndex += Math.round(WORD_GAP_MS / STEP_MS);
    });

    return spans;
  };

  const revealFallback = () => logoText.classList.add('is-ready');
  const safetyTimer = setTimeout(revealFallback, 1500);

  try {
    charSpans = buildChars();
    if (!charSpans) { revealFallback(); return; }

    const playReveal = () => {
      // restart the CSS animation by removing then re-adding the class
      logoText.classList.remove('is-revealing');
      // force reflow so the browser registers the class removal
      void logoText.offsetWidth;
      logoText.classList.add('is-revealing');
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        playReveal();
        clearTimeout(safetyTimer);
        setInterval(playReveal, REPEAT_MS);
      });
    });
  } catch (err) {
    clearTimeout(safetyTimer);
    revealFallback();
  }
}

/* ---------------- FAQ accordion (Home page) ----------------
   Only one FAQ item open at a time. Works via click and
   keyboard (Enter/Space activate a <button> natively). ---------------- */
function initFAQ() {
  const items = document.querySelectorAll('.faq-item');
  if (!items.length) return;

  items.forEach(item => {
    const btn = item.querySelector('.faq-question');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');

      items.forEach(other => {
        if (other === item) return;
        other.classList.remove('is-open');
        const otherBtn = other.querySelector('.faq-question');
        if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
      });

      item.classList.toggle('is-open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
}

/* ---------------- Service pages: "Good to know" accordion ----------------
   Same single-open, real-<button> pattern as initFAQ(). Content stays in
   the DOM at all times (no display:none on the body), so it's present,
   crawlable, and readable with JS disabled — the accordion only changes
   whether it's visually expanded. First row starts open. ---------------- */
function initGoodToKnow() {
  const rows = document.querySelectorAll('.svc-goodknow-row');
  if (!rows.length) return;

  rows.forEach(row => {
    const btn = row.querySelector('.svc-goodknow-trigger');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const isOpen = row.classList.contains('is-open');

      rows.forEach(other => {
        if (other === row) return;
        other.classList.remove('is-open');
        const otherBtn = other.querySelector('.svc-goodknow-trigger');
        if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
      });

      row.classList.toggle('is-open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
}

/* ---------------- Service pages: sub-nav anchors + hero "See what's included" ----------------
   Lightweight anchor nav (Overview/Included/Process/Why Us/FAQs) plus the hero's
   secondary link, which both target the same section IDs. Both need a bigger
   scroll offset than the generic anchor handler above: that handler only
   offsets for the fixed 84px header, but these pages also render the sticky
   .svc-subnav below it (~64px) once scrolled into view, so a plain -84 offset
   would land the target heading partially hidden underneath it. Also drives
   the sub-nav's active-section highlight. */
function initSvcSubnavActive() {
  const nav = document.querySelector('.svc-subnav');
  if (!nav) return;
  const navLinks = Array.from(nav.querySelectorAll('a[href^="#"]'));
  if (!navLinks.length) return;

  const SVC_SUBNAV_OFFSET = -148; // fixed header (84px) + sticky sub-nav (~64px)
  const sectionIds = new Set(navLinks.map(l => l.getAttribute('href')));
  const heroLink = document.querySelector('.svc-hero-secondary[href^="#"]');
  if (heroLink && sectionIds.has(heroLink.getAttribute('href'))) navLinks.push(heroLink);

  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.__lenis) window.__lenis.scrollTo(target, { offset: SVC_SUBNAV_OFFSET });
    }, true); // capture: run before the generic anchor handler in initSmoothScroll()
  });

  const sections = Array.from(sectionIds)
    .map(id => document.querySelector(id))
    .filter(Boolean);
  if (!sections.length) return;

  if (!('IntersectionObserver' in window)) return;

  const setActive = (id) => {
    navLinks.forEach(link => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
    });
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) setActive(entry.target.id);
    });
  }, { rootMargin: `-${112}px 0px -60% 0px`, threshold: 0 });

  sections.forEach(sec => observer.observe(sec));
}

/* ---------------- Homepage: "What are you trying to build?" solution selector ----------------
   Single-open accordion, same interaction pattern as initFAQ(): a
   wrapper div holds a real <button> trigger plus a role="region"
   answer panel. Each answer reveals its matched service + a CTA
   linking to contact.html?service=<slug>, which initContactForm()
   already knows how to preselect in the service dropdown. */
function initSolutionSelector() {
  const options = document.querySelectorAll('.solution-option');
  if (!options.length) return;

  options.forEach(option => {
    const btn = option.querySelector('.solution-option-trigger');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';

      options.forEach(other => {
        if (other === option) return;
        const otherBtn = other.querySelector('.solution-option-trigger');
        if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
      });

      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
}

/* ---------------- Services page: service detail modal ----------------
   One reusable modal, populated from a centralized data object, driven
   by the URL hash so it works both from in-page card clicks and from
   direct/incoming links like services.html#meta-ads (e.g. from Home). */
const SERVICES_DATA = {
  'social-media-management': {
    number: '01',
    title: 'Social Media Management',
    intro: 'Your brand deserves a social media presence that feels intentional, not accidental. We combine content strategy, creative direction, and consistent Instagram management to keep your audience engaged and your brand growing.',
    whatWeDo: 'Social media management with us goes beyond scheduling posts. We build a content strategy around your brand, plan a content calendar that keeps output consistent, and handle community management so every comment and message gets a real response.',
    included: ['Content strategy & planning', 'Content calendar management', 'Reels and post creation', 'Captions and creative direction', 'Posting and scheduling', 'Community management', 'Monthly performance review'],
    whoItsFor: 'Perfect for businesses ready to grow their brand on Instagram, teams that want consistent content without managing it in-house, and founders who want a real content strategy instead of random posting.',
    howItHelps: 'Consistent, well-planned social media marketing keeps your brand visible and familiar to the people who matter most. Over time, that visibility builds trust — and trust is what turns followers into customers.',
    cta: "Let's Grow Your Brand"
  },
  'web-development': {
    number: '02',
    title: 'Web Development',
    intro: 'A business website is often the first real impression a customer forms of you. We focus on website development that looks premium, loads fast, and is genuinely built to convert visitors into customers.',
    whatWeDo: 'We handle every stage of website design and development — from planning the user journey to building a responsive website that works beautifully on any device. Every layout, page, and interaction is built with a clear SEO-friendly structure and one goal: conversion.',
    included: ['Website planning & UI design', 'Responsive website development', 'Landing pages built to convert', 'SEO-friendly site structure', 'Speed & performance optimization', 'Thoughtful UI/UX', 'Contact & inquiry flows'],
    whoItsFor: 'Great for businesses that need a professional business website, brands looking to redesign a site that isn\u2019t performing, and anyone who wants landing pages built specifically to convert.',
    howItHelps: 'A fast, clear website helps visitors understand what you offer within seconds. Better UI/UX and a solid SEO-friendly foundation mean more visitors stay, trust your brand, and take the next step — instead of leaving for a competitor.',
    cta: 'Build Your Website'
  },
  'video-shoot-editing': {
    number: '03',
    title: 'Video Shoot & Editing',
    intro: 'Great video production shows people what your brand feels like before they ever reach out. We shoot and edit brand videos and short-form content designed to hold attention and perform across social media.',
    whatWeDo: 'From product shoots to final video editing, we turn your ideas, spaces, and offerings into scroll-stopping social media videos. Every reel edit is paced, captioned, and styled to match how your audience actually watches content.',
    included: ['Video planning & concepts', 'Product & business shoots', 'Short-form content creation', 'Reel editing & pacing', 'Transitions and motion graphics', 'On-screen text & captions', 'Platform-ready formatting'],
    whoItsFor: 'A strong fit for restaurants, fashion brands, and real estate businesses, along with local businesses that need stronger promotional videos and brands that want branding and marketing-ready content.',
    howItHelps: 'Strong visual content helps people understand your business in seconds, not paragraphs. It gives your social media and ad campaigns a steady supply of brand videos built to perform, not just look good.',
    cta: 'Plan Your Brand Shoot'
  },
  'meta-ads': {
    number: '04',
    title: 'Meta Ads',
    intro: 'Reach alone doesn\u2019t grow a business — the right people seeing the right message does. We run Meta Ads across Facebook and Instagram built around audience targeting, lead generation, and measurable ROAS.',
    whatWeDo: 'We manage your paid advertising end-to-end: building the campaign, defining audience targeting, writing ad creative direction, and setting up retargeting for people who\u2019ve already shown interest. Every campaign is monitored and optimized against real business outcomes.',
    included: ['Campaign setup & structure', 'Audience targeting', 'Ad creative direction', 'Retargeting campaigns', 'Ongoing campaign monitoring', 'Performance optimization', 'Clear performance reporting'],
    whoItsFor: 'Ideal for businesses looking to generate more leads and enquiries, brands that want bookings, sign-ups, or product sales via Meta Ads, and anyone currently running Facebook Ads without a clear return.',
    howItHelps: 'Sharper audience targeting and continuous optimization mean your ad spend goes toward people likely to act — not just impressions. That\u2019s what turns Meta Ads from a cost into a real driver of leads and revenue.',
    cta: 'Launch Your Campaign'
  },
  'app-development': {
    number: '05',
    title: 'App Development',
    intro: 'A well-built app can become one of your most valuable business tools. We handle custom app development end-to-end, turning your idea into a mobile app that\u2019s genuinely useful for your team and customers.',
    whatWeDo: 'We take your business app from idea to launch — mapping out the user experience, building the Android app or cross-platform product, and connecting it to the dashboards and API integrations your operations actually need.',
    included: ['Product planning & scoping', 'UI/UX design', 'Custom app development', 'Booking or ordering system setup', 'Dashboard & admin panel', 'API integration', 'Testing & launch preparation'],
    whoItsFor: 'Suited to businesses that want a customer-facing mobile app, teams that need an internal tool, booking app, or ordering system, and brands ready to build a custom digital product around real workflows.',
    howItHelps: 'A well-planned mobile app makes your service easier to access and your operations easier to run. It gives your business a digital product built around how your customers and team actually work — not a generic template.',
    cta: 'Start Your App Project'
  },
  'ugc-videos': {
    number: '06',
    title: 'UGC Videos',
    intro: 'People trust people more than polished ads. Our UGC videos bring authentic, creator-style content to your brand — the kind that builds brand trust and consistently improves ad performance.',
    whatWeDo: 'We plan and produce UGC content that feels native to the platform, not like a traditional advertisement. From script development to creator coordination, every product video is built to look and feel like real, authentic marketing.',
    included: ['UGC concepts & scripting', 'Creator sourcing & coordination', 'Product video presentation', 'Short-form UGC editing', 'Multiple creative variations', 'Paid ads-ready formatting'],
    whoItsFor: 'Best for brands that want more relatable content for social media and paid ads, businesses looking to boost ad performance with creator content, and teams that need authentic marketing for product launches.',
    howItHelps: 'Authentic, creator-style content makes your brand feel more approachable and builds genuine brand trust. It also gives your paid ads a real edge — UGC consistently outperforms polished ads in engagement and conversion.',
    cta: 'Create Authentic Content'
  }
};

function initServiceModal() {
  const modal = document.getElementById('serviceModal');
  const cards = document.querySelectorAll('.service-card[data-service]');
  if (!modal || !cards.length) return;

  const backdrop = modal.querySelector('.service-modal-backdrop');
  const panel = modal.querySelector('.service-modal-panel');
  const closeBtn = modal.querySelector('.service-modal-close');
  const numberEl = modal.querySelector('.service-modal-number');
  const titleEl = modal.querySelector('.service-modal-title');
  const introEl = modal.querySelector('.service-modal-intro');
  const whatEl = modal.querySelector('.service-modal-whatwedo');
  const includedEl = modal.querySelector('.service-modal-included');
  const whoEl = modal.querySelector('.service-modal-who');
  const howEl = modal.querySelector('.service-modal-how');
  const ctaEl = modal.querySelector('.service-modal-cta');
  const titleId = titleEl.id || 'serviceModalTitle';
  titleEl.id = titleId;
  modal.setAttribute('aria-labelledby', titleId);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let activeId = null;
  let lastFocusedCard = null;
  let closeTimer = null;

  const checkIcon = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const render = (id) => {
    const data = SERVICES_DATA[id];
    if (!data) return false;

    numberEl.textContent = data.number;
    titleEl.textContent = data.title;
    introEl.textContent = data.intro;
    whatEl.textContent = data.whatWeDo;
    includedEl.innerHTML = data.included.map(item => `<li>${checkIcon}<span>${item}</span></li>`).join('');
    whoEl.textContent = data.whoItsFor;
    howEl.textContent = data.howItHelps;
    ctaEl.setAttribute('href', `contact.html?service=${id}`);
    // Service-specific CTA label, keeping the existing arrow icon markup
    // intact (only the visible text before it changes per service).
    const ctaIcon = ctaEl.querySelector('.btn-icon');
    ctaEl.textContent = data.cta ? `${data.cta} ` : "Let's Talk About This Service ";
    if (ctaIcon) ctaEl.appendChild(ctaIcon);

    return true;
  };

  const unlockScroll = () => {
    document.body.classList.remove('modal-open');
    if (window.__lenisResume) window.__lenisResume();
  };

  // Even with Lenis stopped, it can still swallow wheel/touch events that
  // bubble up from inside the modal (since it listens on the document).
  // Stop propagation right at the panel so native scrolling always wins.
  ['wheel', 'touchmove'].forEach((evt) => {
    panel.addEventListener(evt, (e) => { e.stopPropagation(); }, { passive: true });
  });

  const openModal = (id, opts = {}) => {
    if (activeId === id && !modal.hidden) return; // already open — avoid a redundant re-render/flicker
    if (!render(id)) return;
    activeId = id;

    if (opts.triggerEl) lastFocusedCard = opts.triggerEl;

    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    panel.scrollTop = 0;
    document.body.classList.add('modal-open'); // lock body scroll immediately, cheap
    modal.hidden = false;

    // Wait a frame before triggering the transition. render() just wrote a
    // fair amount of innerHTML (the "what's included" list, etc.) — starting
    // the transition in the very next line forces the browser to lay all of
    // that out synchronously *and* animate in the same frame, which is what
    // caused the stutter on open. rAF lets the layout from render() settle
    // on its own frame first; the second rAF (next frame) is when we flip
    // the class, so the transition starts from a clean, already-painted state.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.classList.add('is-open');
      });
    });

    // Destroying/creating the Lenis instance does real work (removes/attaches
    // DOM listeners). Doing it in the same frame as the open transition can
    // cause a dropped frame right as the modal appears, which reads as a
    // stutter/lag. Deferring it lets the CSS transition kick off smoothly first.
    requestAnimationFrame(() => {
      if (window.__lenisSuspend) window.__lenisSuspend();
    });

    if (!opts.skipFocus) {
      (prefersReducedMotion ? closeBtn.focus() : setTimeout(() => closeBtn.focus(), 60));
    }

    if (opts.updateHash !== false) {
      const newHash = `#${id}`;
      if (window.location.hash !== newHash) {
        history.pushState(null, '', newHash);
      }
    }
  };

  const closeModal = (opts = {}) => {
    if (!activeId) return;
    modal.classList.remove('is-open');
    unlockScroll();

    const finish = () => {
      modal.hidden = true;
      activeId = null;
    };
    if (prefersReducedMotion) {
      finish();
    } else {
      closeTimer = setTimeout(finish, 320);
    }

    if (opts.returnFocus !== false && lastFocusedCard) {
      lastFocusedCard.focus({ preventScroll: true });
    }

    if (opts.updateHash !== false && window.location.hash) {
      history.pushState(null, '', window.location.pathname + window.location.search);
    }
  };

  // Card clicks — open modal, update hash, remember trigger for focus return.
  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const id = card.dataset.service;
      openModal(id, { triggerEl: card });
    });
  });

  closeBtn.addEventListener('click', () => closeModal());

  backdrop.addEventListener('click', () => closeModal());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  // Basic focus trap while the modal is open.
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !modal.classList.contains('is-open')) return;
    const focusable = panel.querySelectorAll('a[href], button:not([disabled])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Hash-driven open/close: handles direct links (services.html#meta-ads),
  // in-page navigation via history, and the browser Back/Forward buttons.
  const syncWithHash = () => {
    const id = window.location.hash.replace('#', '');
    if (id && SERVICES_DATA[id]) {
      if (id !== activeId) {
        // Open the modal immediately — don't wait on a scroll animation first.
        openModal(id, { updateHash: false, skipFocus: false });
        const targetCard = document.querySelector(`.service-card[data-service="${id}"]`);
        if (targetCard) {
          targetCard.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
      }
    } else if (!id && activeId) {
      closeModal({ updateHash: false, returnFocus: false });
    }
  };

  window.addEventListener('hashchange', syncWithHash);

  // Run once on load in case the page was opened with a service hash already set.
  syncWithHash();
}