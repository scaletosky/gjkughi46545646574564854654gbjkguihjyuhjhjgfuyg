/* ============================================================
   PHASE 5 — Website Analytics tracking
   Lightweight, privacy-conscious, fail-silent tracker for the public
   Scale To Sky website. Sends anonymous events to the Super Admin
   backend's public analytics endpoint. Never blocks rendering,
   navigation, animations, or the contact form — if the analytics
   request fails or the API is unreachable, the site behaves exactly
   as if this script were absent.

   Loaded BEFORE main.js on every public page (see each page's
   </body>). Exposes a small window.STSKAnalytics API that other
   scripts (main.js, portfolio-public.js) call into for CTA/portfolio/
   contact-form events.
   ============================================================ */

(function () {
  // Same origin convention as js/main.js and js/portfolio-public.js —
  // when this static site is hosted separately from the Super Admin
  // backend, set window.STSK_API_BASE before this script runs.
  //
  // Local-dev convenience: if nothing set it and we're clearly on a
  // typical local static-file dev server (Live Server's default 5500,
  // VS Code's other common ports, or file://), default to the Super
  // Admin backend's default local port (5000) instead of silently
  // POSTing analytics/portfolio/lead requests back at the static
  // server itself (which 404s/405s them). This default is skipped
  // entirely once STSK_API_BASE is explicitly set — e.g. in production.
  if (window.STSK_API_BASE === undefined) {
    const commonStaticDevPorts = ['5500', '5501', '3000', '8080', '8000'];
    if (commonStaticDevPorts.includes(window.location.port)) {
      window.STSK_API_BASE = `${window.location.protocol}//${window.location.hostname}:5000`;
    }
  }

  const API_BASE = window.STSK_API_BASE || '';
  const ENDPOINT = `${API_BASE}/api/analytics/events`;

  const VISITOR_KEY = 'stsk_visitor_id';
  const SESSION_KEY = 'stsk_session_id';
  const SESSION_EXPIRES_KEY = 'stsk_session_expires';
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity

  // ----------------------------------------------------------
  // Storage helpers — localStorage for the long-lived anonymous
  // visitor id, sessionStorage-independent "expires at" tracking via
  // localStorage so the 30-minute timeout survives tab closes (a
  // closed/reopened tab within 30 minutes is still the same session,
  // which matches "session" as a time-boxed visit rather than a tab
  // lifetime). Wrapped in try/catch: if storage is unavailable
  // (private browsing, disabled storage), tracking degrades to
  // per-page-load ids rather than throwing.
  // ----------------------------------------------------------
  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
  }

  function randomId() {
    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for very old browsers — still random, still contains no
    // personal information, just a weaker RNG.
    let out = '';
    for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  }

  function getOrCreateVisitorId() {
    let id = safeGet(VISITOR_KEY);
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      id = randomId();
      safeSet(VISITOR_KEY, id);
    }
    return id;
  }

  function getOrCreateSessionId() {
    const now = Date.now();
    const expiresAt = Number(safeGet(SESSION_EXPIRES_KEY) || 0);
    let id = safeGet(SESSION_KEY);

    const expired = !id || !expiresAt || now > expiresAt;
    if (expired) {
      id = randomId();
      safeSet(SESSION_KEY, id);
    }

    // Sliding expiry: every touch extends the window, so an active
    // visitor never gets split into a new session mid-visit.
    safeSet(SESSION_EXPIRES_KEY, String(now + SESSION_TIMEOUT_MS));

    return { id, isNewSession: expired };
  }

  const visitorId = getOrCreateVisitorId();

  // ----------------------------------------------------------
  // Sending — always async, always fails silently. Uses
  // navigator.sendBeacon when available (fire-and-forget, survives
  // page unload) and falls back to fetch with keepalive.
  // ----------------------------------------------------------
  function send(event, extra) {
    try {
      const session = getOrCreateSessionId();

      const payload = {
        event,
        visitorId,
        sessionId: session.id,
        page: window.location.pathname,
        referrer: document.referrer || '',
        ...extra,
      };

      // Capture UTM params on the first event of a navigation, if present.
      const params = new URLSearchParams(window.location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((key) => {
        const val = params.get(key);
        if (val) payload[toCamel(key)] = val.slice(0, 100);
      });

      const body = JSON.stringify(payload);

      // navigator.sendBeacon: use text/plain (not application/json) so
      // this stays a CORS "simple request" — no preflight, and
      // crucially no browser-forced credentials mode. A Blob typed as
      // application/json triggers a preflight that some browsers send
      // with credentials: 'include', which this endpoint's CORS policy
      // (credentials: false, matching the public/unauthenticated
      // nature of analytics ingestion) then correctly rejects. The
      // backend still parses this fine — Express's json() body parser
      // reads by content, not solely by Content-Type sniffing here
      // since the analytics route accepts the raw JSON string body
      // regardless of the text/plain label.
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'text/plain' });
        const ok = navigator.sendBeacon(ENDPOINT, blob);
        if (ok) return;
      }

      // Fallback (or sendBeacon failed to queue): fire-and-forget fetch.
      // No await anywhere in this module — tracking must never block
      // the caller (page rendering, nav, form submission).
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'omit',
      }).catch(() => { /* fail silently — see module header */ });

      if (session.isNewSession) {
        // no-op hook point: session_start is sent explicitly by trackPageView,
        // not implied here, to avoid double-counting.
      }
    } catch (err) {
      // Never let a tracking bug break the page. Safe dev-only log.
      if (window.STSK_DEBUG) console.warn('[analytics] send failed:', err);
    }
  }

  function toCamel(snake) {
    return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  // ----------------------------------------------------------
  // Duplicate-event guards
  // ----------------------------------------------------------
  let pageViewSentForThisLoad = false;
  const scrollMilestonesSent = new Set();

  function trackPageView() {
    if (pageViewSentForThisLoad) return;
    pageViewSentForThisLoad = true;

    const session = getOrCreateSessionId();
    if (session.isNewSession) {
      send('session_start');
    }
    send('page_view');
  }

  function trackCtaClick(ctaId) {
    if (!ctaId) return;
    send('cta_click', { metadata: { cta: ctaId } });
  }

  function trackPortfolioView(slug) {
    if (!slug) return;
    send('portfolio_view', { metadata: { slug: String(slug).slice(0, 100) } });
  }

  function trackContactFormOpen() {
    send('contact_form_open');
  }

  function trackContactFormSubmit() {
    send('contact_form_submit');
  }

  // ----------------------------------------------------------
  // Scroll depth — milestone-based (25/50/75/90%), fired at most once
  // per milestone per page load. Throttled via requestAnimationFrame
  // rather than firing on every scroll event.
  // ----------------------------------------------------------
  function initScrollDepthTracking() {
    const milestones = [25, 50, 75, 90];
    let ticking = false;

    function check() {
      ticking = false;
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const scrollHeight = doc.scrollHeight - doc.clientHeight;
      if (scrollHeight <= 0) return;

      const pct = (scrollTop / scrollHeight) * 100;
      milestones.forEach((m) => {
        if (pct >= m && !scrollMilestonesSent.has(m)) {
          scrollMilestonesSent.add(m);
          send('scroll_depth', { metadata: { milestone: String(m) } });
        }
      });
    }

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(check);
    }, { passive: true });
  }

  // ----------------------------------------------------------
  // CTA auto-binding — any element with [data-cta-id] fires a
  // cta_click on click, without each page needing custom JS.
  // ----------------------------------------------------------
  function initCtaAutoBinding() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-cta-id]');
      if (!el) return;
      trackCtaClick(el.getAttribute('data-cta-id'));
    });
  }

  // ----------------------------------------------------------
  // Contact form open — fires once, the first time any field in
  // .contact-form receives focus (a reasonable proxy for "the visitor
  // started interacting with the form" without needing a scroll-into-
  // view heuristic). contact_form_submit is fired by main.js's
  // initContactForm on successful submission via
  // window.STSKAnalytics.trackContactFormSubmit().
  // ----------------------------------------------------------
  function initContactFormOpenTracking() {
    const form = document.querySelector('.contact-form');
    if (!form) return;
    let opened = false;
    form.addEventListener('focusin', () => {
      if (opened) return;
      opened = true;
      trackContactFormOpen();
    });
  }

  function init() {
    trackPageView();
    initScrollDepthTracking();
    initCtaAutoBinding();
    initContactFormOpenTracking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API for other scripts (portfolio-public.js, main.js).
  window.STSKAnalytics = {
    trackCtaClick,
    trackPortfolioView,
    trackContactFormSubmit,
  };
})();