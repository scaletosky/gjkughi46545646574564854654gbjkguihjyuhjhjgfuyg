/* ============================================================
   PHASE 10 — Homepage Portfolio Integration & Final Sync
   Homepage "Selected work" preview backed entirely by the real
   Portfolio collection (Phase 6) via the existing
   /api/portfolio/featured endpoint (featured+published priority,
   deterministic displayOrder-based fallback fill, capped at 3,
   server-side — same algorithm and endpoint used since Phase 3;
   no new backend work was needed for Phase 10).

   Brought in line with js/portfolio-public.js (Phase 8/9) so
   Homepage and the Portfolio page render/behave identically for
   the same project:
     - View Details now always routes to the internal Case Study
       page (portfolio-project.html?slug=...) via caseStudyUrl(),
       never to the external project.projectUrl and never to a
       plain portfolio.html link (previously incorrect).
     - Media rendering now uses the same image/video fallback
       chain (video -> videoPoster -> image -> placeholder) with
       IntersectionObserver-gated playback, instead of images only.

   Renders .work-card markup (shared CSS with the Portfolio page's
   editorial cards) rather than .portfolio-item markup.

   Phase 9: when 3 projects are returned, renders the same
   featured + 2-up editorial layout used on the Portfolio page
   (.work-grid-editorial / .work-card-primary) instead of a flat
   3-up grid, for a stronger "selected work" showcase. No change to
   the data source, endpoint, or fallback behaviour — purely a
   rendering/markup change layered on top of the existing fetch.
   ============================================================ */

(function () {
  const API_BASE = window.STSK_API_BASE || '';

  const CATEGORY_TO_FILTER = {
    'Website Development': 'websites',
    'App Development': 'apps',
    'Branding': 'branding',
    'Digital Marketing': 'marketing',
    'Social Media Marketing': 'marketing',
    'Other': 'other',
  };

  const grid = document.getElementById('home-portfolio-grid');
  const loadingEl = document.getElementById('home-portfolio-loading');
  const emptyEl = document.getElementById('home-portfolio-empty');
  const kickerEl = document.getElementById('home-portfolio-kicker');
  const headingEl = document.getElementById('home-portfolio-heading');
  const buttonEl = document.getElementById('home-portfolio-button');

  if (!grid) return; // not on the homepage

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  /**
   * Builds the URL for a project's Case Study page (Phase 9), safely
   * URL-encoding the slug. Returns null when there is no usable slug so
   * callers can fall back to a non-navigating card instead of ever
   * emitting "...?slug=undefined". Mirrors js/portfolio-public.js's
   * caseStudyUrl so Homepage and Portfolio page route identically
   * (spec: sections 12/13/51/72).
   */
  function caseStudyUrl(project) {
    const slug = project && project.slug;
    if (!slug) return null;
    return `portfolio-project.html?slug=${encodeURIComponent(slug)}`;
  }

  /**
   * Renders a project's primary media as image or video with a safe
   * fallback chain: video -> videoPoster -> image -> placeholder. Never
   * lets a missing/broken source collapse the card. Mirrors
   * js/portfolio-public.js's renderProjectMedia (spec: sections 14/15/25).
   *
   * Video takes priority whenever it's present, regardless of the
   * project's `mediaType` — mediaType only used to pick which upload
   * panel the admin sees by default, not to gate rendering. A project
   * can carry both an image and a video (image doubling as poster/
   * fallback), so `project.video` alone is the signal to show a video.
   */
  function renderProjectMedia(project) {
    const placeholder = 'assets/images/logo-mark-small.png';
    const alt = escapeHtml(project.title || '');

    if (project.video) {
      const videoSrc = escapeHtml(API_BASE + project.video);
      const posterFallback = project.image ? API_BASE + project.image : placeholder;
      const posterSrc = project.videoPoster ? escapeHtml(API_BASE + project.videoPoster) : escapeHtml(posterFallback);
      // onerror fallback: if the video itself fails to load, swap the
      // whole element for the poster/placeholder image so the card
      // never shows a broken player.
      return `<video class="project-media" src="${videoSrc}" poster="${posterSrc}" muted loop playsinline preload="metadata" aria-label="${alt}" onerror="this.replaceWith(Object.assign(document.createElement('img'),{src:'${posterSrc}',alt:'${alt}',className:'project-media'}))"></video>`;
    }

    const imgSrc = project.image ? escapeHtml(API_BASE + project.image) : escapeHtml(placeholder);
    return `<img class="project-media" src="${imgSrc}" alt="${alt}" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(placeholder)}'">`;
  }

  // Homepage videos are more performance-sensitive than the Portfolio
  // page (this section is above the fold on first load), so cards only
  // start playing once actually visible, and pause again offscreen
  // (spec: sections 16/17/46). Also enforces at most one actively
  // playing video across the homepage grid at a time (spec: section
  // 17) — mirrors js/portfolio-public.js's getMediaObserver.
  let mediaObserver = null;
  let currentlyPlayingVideo = null;
  function getMediaObserver() {
    if (mediaObserver) return mediaObserver;
    if (!('IntersectionObserver' in window)) return null;
    mediaObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          if (entry.isIntersecting) {
            if (currentlyPlayingVideo && currentlyPlayingVideo !== video) {
              currentlyPlayingVideo.pause();
            }
            currentlyPlayingVideo = video;
            video.play().catch(() => {});
          } else {
            video.pause();
            if (currentlyPlayingVideo === video) currentlyPlayingVideo = null;
          }
        });
      },
      { threshold: 0.35 }
    );
    return mediaObserver;
  }

  function wireCardMedia(container) {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const videos = container.querySelectorAll('video.project-media');
    if (!videos.length) return;

    if (reduceMotion) {
      videos.forEach((v) => v.removeAttribute('autoplay'));
      return;
    }

    const observer = getMediaObserver();
    videos.forEach((v) => {
      if (observer) observer.observe(v);
      else v.play().catch(() => {});
    });
  }

  function applyPageContent(content) {
    if (!content) return;
    if (kickerEl && content.homepageKicker) kickerEl.textContent = content.homepageKicker;
    if (headingEl && content.homepageHeading) headingEl.textContent = content.homepageHeading;
    if (buttonEl) {
      if (content.homepageButtonText) buttonEl.textContent = content.homepageButtonText;
      if (content.homepageButtonLink) buttonEl.setAttribute('href', content.homepageButtonLink);
    }
  }

  async function loadPageContent() {
    try {
      const response = await fetch(`${API_BASE}/api/portfolio/page-content`, { credentials: 'omit' });
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.success) applyPageContent(data.data);
    } catch {
      // Non-critical — static fallback copy already sits in the markup.
    }
  }

  function cardHtml(project, isPrimary) {
    const filterSlug = CATEGORY_TO_FILTER[project.category] || 'other';

    // "View Details" always points at the internal Case Study page via
    // the project's slug — never at the external projectUrl, and never
    // at the generic Portfolio page (spec: sections 12/13/51/52/72). If
    // there's no usable slug, fall back to the Portfolio page rather
    // than emitting an unsafe/undefined URL.
    const href = caseStudyUrl(project) || 'portfolio.html';
    const trackAttr = `data-portfolio-track="${escapeHtml(project.slug || project._id || '')}"`;
    const media = renderProjectMedia(project);
    // Editorial layout (Phase 9): first featured project renders larger
    // via .work-card-primary (existing CSS, previously only used by the
    // Portfolio page). Purely a class addition — markup, data source and
    // href/media logic are otherwise identical for every card.
    const primaryClass = isPrimary ? ' work-card-primary' : '';

    return `
      <a href="${escapeHtml(href)}" class="work-card${primaryClass} reveal reveal-stagger" ${trackAttr} data-category="${filterSlug}">
        <div class="work-thumb">${media}</div>
        <div class="work-meta">
          <div>
            <div class="work-category">${escapeHtml(project.category)}</div>
            <div class="work-name">${escapeHtml(project.title)}</div>
            ${project.shortDescription ? `<p class="work-desc">${escapeHtml(project.shortDescription)}</p>` : ''}
            ${project.clientName ? `<p class="work-client">${escapeHtml(project.clientName)}</p>` : ''}
            <span class="work-view-details">View Details <svg class="work-arrow-inline" viewBox="0 0 18 18" fill="none"><path d="M4 14L14 4M6 4h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </div>
          <svg class="work-arrow" viewBox="0 0 18 18" fill="none"><path d="M4 14L14 4M6 4h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </a>
    `;
  }

  function showState(state) {
    loadingEl.hidden = state !== 'loading';
    emptyEl.hidden = state !== 'empty';
    grid.hidden = state !== 'ready';
  }

  /**
   * Newly-rendered cards carry .reveal but main.js's IntersectionObserver
   * already ran once on DOMContentLoaded and won't see elements added
   * afterward. Re-run the same observation logic here, scoped to just
   * these cards, so they still get the fade/stagger-in treatment instead
   * of appearing with no animation (or stuck invisible if .reveal's
   * default state is opacity:0 pre-.is-visible).
   */
  function observeRevealForGrid() {
    const items = grid.querySelectorAll('.reveal');
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    items.forEach((el, index) => {
      el.style.setProperty('--stagger-delay', `${index * 90}ms`);
      observer.observe(el);
    });
  }

  // Analytics: portfolio_view fires on an actual open (card click), same
  // event name/shape as the main Portfolio page, delegated so it works
  // regardless of re-renders. No separate/duplicate event is introduced.
  grid.addEventListener('click', (e) => {
    const el = e.target.closest('[data-portfolio-track]');
    if (!el || !window.STSKAnalytics) return;
    window.STSKAnalytics.trackPortfolioView(el.getAttribute('data-portfolio-track'));
  });

  async function loadFeaturedProjects() {
    showState('loading');

    let response;
    try {
      response = await fetch(`${API_BASE}/api/portfolio/featured`, { credentials: 'omit' });
    } catch {
      // Network failure: fail closed to the empty state rather than ever
      // showing stale/fake dummy projects.
      showState('empty');
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data || !data.success) {
      showState('empty');
      return;
    }

    const projects = (data.data.projects || []).slice(0, 3);

    if (projects.length === 0) {
      showState('empty');
      return;
    }

    // Editorial layout (Phase 9): 1 project renders as a large featured
    // showcase, remaining projects (if any) sit in a two-up row beneath
    // it — reusing .work-grid-editorial/.work-card-primary, the same
    // CSS already powering this layout on the Portfolio page. Falls
    // back to the plain .work-grid on 1-2 projects (nothing to pair in
    // a secondary row), so nothing renders awkwardly empty.
    if (projects.length >= 3) {
      grid.classList.add('work-grid-editorial');
      grid.classList.remove('work-grid');
      const [primary, ...rest] = projects;
      grid.innerHTML = `
        ${cardHtml(primary, true)}
        <div class="work-secondary-row">
          ${rest.map((p) => cardHtml(p, false)).join('')}
        </div>
      `;
    } else {
      grid.classList.add('work-grid');
      grid.classList.remove('work-grid-editorial');
      grid.innerHTML = projects.map((p) => cardHtml(p, false)).join('');
    }

    showState('ready');
    observeRevealForGrid();
    wireCardMedia(grid);
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadPageContent();
    loadFeaturedProjects();
  });
})();