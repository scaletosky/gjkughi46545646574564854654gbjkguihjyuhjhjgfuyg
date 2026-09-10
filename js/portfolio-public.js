/* ============================================================
   PHASE 7 — Public Portfolio page content management
   Fetches page content (hero/work strip/featured/all projects/
   filters/testimonial/CTA) and published projects from the Super
   Admin backend, and renders the full Portfolio page dynamically.
   Builds on the Phase 3 filtering/rendering approach — still does
   not touch main.js, still implements its own lightweight filter
   binding scoped to this page's dynamically-created cards.
   ============================================================ */

(function () {
  // The Super Admin backend serves both the admin app and the public
  // API from the same origin. When this static site is hosted
  // separately from that backend, set window.STSK_API_BASE (e.g. in a
  // small inline <script> before this file) to the backend's origin,
  // such as "https://admin.scaletosky.com". Left empty, requests are
  // same-origin relative paths.
  const API_BASE = window.STSK_API_BASE || '';

  // Maps a Portfolio category (as stored/admin-selected) to the public
  // filter bar's short slug. Keep in sync with the filter buttons in
  // portfolio.html and the categories defined in the backend model.
  const CATEGORY_TO_FILTER = {
    'Website Development': 'websites',
    'App Development': 'apps',
    'Branding': 'branding',
    'Digital Marketing': 'marketing',
    'Social Media Marketing': 'marketing',
    'Other': 'other',
  };

  // ---- All Projects grid elements ----
  const grid = document.getElementById('portfolio-grid');
  const loadingEl = document.getElementById('portfolio-loading');
  const errorEl = document.getElementById('portfolio-error');
  const emptyStateEl = document.getElementById('portfolio-empty-state');
  const noFilterResultsEl = document.getElementById('portfolio-no-filter-results');
  const filterBar = document.getElementById('portfolio-filter-bar');
  const allProjectsSection = document.getElementById('portfolio-work');
  const allProjectsHeadingWrap = document.getElementById('portfolio-allprojects-heading-wrap');
  const allProjectsKickerEl = document.getElementById('portfolio-allprojects-kicker');
  const allProjectsHeadingEl = document.getElementById('portfolio-allprojects-heading');
  const allProjectsDescriptionEl = document.getElementById('portfolio-allprojects-description');

  if (!grid) return; // not on the portfolio page

  // ---- Hero elements ----
  const heroSection = document.getElementById('portfolio-hero-section');
  const heroKickerEl = document.getElementById('portfolio-hero-kicker');
  const heroHeadingEl = document.getElementById('portfolio-hero-heading');
  const heroDescriptionEl = document.getElementById('portfolio-hero-description');
  const heroSupportingEl = document.getElementById('portfolio-hero-supporting');
  const heroCtaEl = document.getElementById('portfolio-hero-cta');

  // ---- Work/Trust strip elements ----
  const workStripSection = document.getElementById('portfolio-workstrip-section');
  const workStripGrid = document.getElementById('portfolio-workstrip-grid');

  // ---- Featured Work elements ----
  const featuredSection = document.getElementById('portfolio-featured-section');
  const featuredKickerEl = document.getElementById('portfolio-featured-kicker');
  const featuredHeadingEl = document.getElementById('portfolio-featured-heading');
  const featuredDescriptionEl = document.getElementById('portfolio-featured-description');
  const featuredGrid = document.getElementById('portfolio-featured-grid');

  // ---- Testimonial elements ----
  const testimonialSection = document.getElementById('portfolio-testimonial-section');
  const testimonialKickerEl = document.getElementById('portfolio-testimonial-kicker');
  const testimonialHeadingEl = document.getElementById('portfolio-testimonial-heading');
  const testimonialQuoteEl = document.getElementById('portfolio-testimonial-quote');
  const testimonialAvatarEl = document.getElementById('portfolio-testimonial-avatar');
  const testimonialNameEl = document.getElementById('portfolio-testimonial-name');
  const testimonialRoleEl = document.getElementById('portfolio-testimonial-role');

  // ---- Final CTA elements ----
  const ctaSection = document.getElementById('portfolio-cta-section');
  const ctaHeadingEl = document.getElementById('portfolio-cta-heading');
  const ctaDescriptionEl = document.getElementById('portfolio-cta-description');
  const ctaButtonEl = document.getElementById('portfolio-cta-button');

  let projects = [];
  let activeFilter = 'all';
  let featuredMaxProjects = 3;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function arrowIconSvg() {
    return '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 14L14 4M6 4h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /**
   * Builds the URL for a project's Case Study page (Phase 9), safely
   * URL-encoding the slug. Returns null when there is no usable slug so
   * callers can fall back to a non-navigating card instead of ever
   * emitting "...?slug=undefined" (spec: section 48/60).
   */
  function caseStudyUrl(project) {
    const slug = project && project.slug;
    if (!slug) return null;
    return `portfolio-project.html?slug=${encodeURIComponent(slug)}`;
  }

  // Fired via IntersectionObserver so at most one video plays/loads at a
  // time per card and offscreen videos are paused — avoids downloading
  // or decoding every project video at once (spec: sections 11/37/59).
  // Also enforces at most one *actively playing* video across the whole
  // grid at any time (spec: section 17) — on a small/mobile viewport
  // more than one card can be simultaneously "visible" per the observer
  // threshold, but only the most-recently-intersected one is allowed to
  // actually autoplay; the rest stay paused on their poster frame until
  // they become the active one.
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
            // Best-effort: browsers may still block autoplay; failure is
            // silent and the poster/first-frame remains visible.
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

  /**
   * Renders a project's primary media as image or video with a safe
   * fallback chain: video -> videoPoster -> image -> placeholder. Never
   * lets a missing/broken source collapse the card (spec: sections
   * 10/25/58/65). `eager` requests eager-loading for the single
   * above-the-fold featured image only (spec: section 24).
   *
   * Video takes priority whenever it's present, regardless of the
   * project's `mediaType` — a project can carry both an image and a
   * video (image doubling as poster/fallback), so `project.video` alone
   * is the signal to show a video.
   */
  function renderProjectMedia(project, eager) {
    const placeholder = 'assets/images/logo-mark-small.png';
    const alt = escapeHtml(project.title || '');
    const loadingAttr = eager ? '' : ' loading="lazy"';

    if (project.video) {
      const videoSrc = escapeHtml(API_BASE + project.video);
      const posterFallback = project.image ? API_BASE + project.image : placeholder;
      const posterSrc = project.videoPoster ? escapeHtml(API_BASE + project.videoPoster) : escapeHtml(posterFallback);
      // onerror fallback: if the video itself fails to load, swap the
      // whole element for the poster/placeholder image so the card never
      // shows a broken player (spec: section 25).
      return `<video class="project-media" src="${videoSrc}" poster="${posterSrc}" muted loop playsinline preload="metadata" aria-label="${alt}" onerror="this.replaceWith(Object.assign(document.createElement('img'),{src:'${posterSrc}',alt:'${alt}',className:'project-media'}))"></video>`;
    }

    const imgSrc = project.image ? escapeHtml(API_BASE + project.image) : escapeHtml(placeholder);
    return `<img class="project-media" src="${imgSrc}" alt="${alt}"${loadingAttr} onerror="this.onerror=null;this.src='${escapeHtml(placeholder)}'">`;
  }

  /**
   * Registers a card's <video> (if any) with the shared observer so it
   * only plays while visible, and pauses on prefers-reduced-motion.
   */
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
      else v.play().catch(() => {}); // no IO support: best-effort static autoplay
    });
  }

  /**
   * Renders the "All" button plus one button per enabled filter returned
   * by the page-content API. Falls back to the current static markup
   * (already in the DOM) if the content API is unavailable, so the page
   * never ends up with a filter bar showing only "All".
   */
  function renderFilterBar(filters) {
    if (!filterBar || !Array.isArray(filters) || filters.length === 0) return;

    filterBar.innerHTML = filters
      .map((f, idx) => `<button class="filter-btn${idx === 0 ? ' is-active' : ''}" data-filter="${escapeHtml(f.slug)}"${idx === 0 ? ' aria-current="true"' : ''}>${escapeHtml(f.label)}</button>`)
      .join('');

    activeFilter = filters[0] ? filters[0].slug : 'all';
  }

  // ---- Empty-optional-field helpers: hide instead of leaving an empty
  // element or empty container taking up space (spec: section 21/22). ----
  function setTextOrHide(el, text) {
    if (!el) return;
    if (text) {
      el.textContent = text;
      el.hidden = false;
    } else {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function applyHero(hero) {
    if (!hero || hero.enabled === false) {
      if (heroSection) heroSection.hidden = true;
      return;
    }
    if (heroSection) heroSection.hidden = false;

    if (heroKickerEl && hero.kicker) heroKickerEl.textContent = hero.kicker;
    if (heroHeadingEl && hero.heading) heroHeadingEl.textContent = hero.heading;
    if (heroDescriptionEl && hero.description) heroDescriptionEl.textContent = hero.description;

    setTextOrHide(heroSupportingEl, hero.supportingText);

    if (heroCtaEl) {
      if (hero.ctaText && hero.ctaLink) {
        heroCtaEl.textContent = hero.ctaText;
        heroCtaEl.setAttribute('href', hero.ctaLink);
        heroCtaEl.hidden = false;
      } else {
        heroCtaEl.hidden = true;
      }
    }
  }

  function workStripItemHtml(item) {
    return `
      <div class="stat-item">
        <div class="stat-num">${escapeHtml(item.value)}</div>
        <div class="stat-label">${escapeHtml(item.label)}</div>
      </div>
    `;
  }

  function applyWorkStrip(workStrip) {
    const items = (workStrip && Array.isArray(workStrip.items)) ? workStrip.items : [];
    if (!workStrip || !workStrip.enabled || items.length === 0) {
      if (workStripSection) workStripSection.hidden = true;
      if (workStripGrid) workStripGrid.innerHTML = '';
      return;
    }
    if (workStripGrid) workStripGrid.innerHTML = items.map(workStripItemHtml).join('');
    if (workStripSection) workStripSection.hidden = false;
  }

  function applyFeaturedWorkContent(featuredWork) {
    featuredMaxProjects = (featuredWork && Number.isFinite(Number(featuredWork.maxProjects)))
      ? Number(featuredWork.maxProjects)
      : 3;

    if (!featuredWork || featuredWork.enabled === false) {
      if (featuredSection) featuredSection.hidden = true;
      return { enabled: false };
    }

    if (featuredKickerEl && featuredWork.kicker) featuredKickerEl.textContent = featuredWork.kicker;
    if (featuredHeadingEl && featuredWork.heading) featuredHeadingEl.textContent = featuredWork.heading;
    setTextOrHide(featuredDescriptionEl, featuredWork.description);

    return { enabled: true };
  }

  function applyAllProjectsContent(allProjects) {
    if (!allProjects || allProjects.enabled === false) {
      if (allProjectsSection) allProjectsSection.hidden = true;
      return;
    }
    if (allProjectsSection) allProjectsSection.hidden = false;

    const hasHeading = Boolean(allProjects.kicker || allProjects.heading || allProjects.description);
    if (allProjectsHeadingWrap) allProjectsHeadingWrap.hidden = !hasHeading;

    if (allProjectsKickerEl && allProjects.kicker) allProjectsKickerEl.textContent = allProjects.kicker;
    if (allProjectsHeadingEl && allProjects.heading) allProjectsHeadingEl.textContent = allProjects.heading;
    setTextOrHide(allProjectsDescriptionEl, allProjects.description);
  }

  function applyTestimonialSection(testimonialSectionData) {
    const t = testimonialSectionData && testimonialSectionData.testimonial;
    if (!testimonialSectionData || !testimonialSectionData.enabled || !t) {
      if (testimonialSection) testimonialSection.hidden = true;
      return;
    }

    if (testimonialKickerEl && testimonialSectionData.kicker) testimonialKickerEl.textContent = testimonialSectionData.kicker;
    if (testimonialHeadingEl && testimonialSectionData.heading) testimonialHeadingEl.textContent = testimonialSectionData.heading;

    if (testimonialQuoteEl) testimonialQuoteEl.textContent = `"${t.quote || ''}"`;
    if (testimonialNameEl) testimonialNameEl.textContent = t.name || '';
    if (testimonialRoleEl) testimonialRoleEl.textContent = [t.role, t.company].filter(Boolean).join(', ');
    if (testimonialAvatarEl) testimonialAvatarEl.textContent = t.initials || '';

    if (testimonialSection) testimonialSection.hidden = false;
  }

  function applyCta(cta) {
    if (!cta || cta.enabled === false) {
      if (ctaSection) ctaSection.hidden = true;
      return;
    }
    if (ctaSection) ctaSection.hidden = false;

    if (ctaHeadingEl && cta.heading) ctaHeadingEl.textContent = cta.heading;
    if (ctaDescriptionEl && cta.description) ctaDescriptionEl.textContent = cta.description;
    if (ctaButtonEl) {
      if (cta.buttonText) {
        // Preserve the arrow icon markup — only replace the leading text node.
        const icon = ctaButtonEl.querySelector('svg');
        ctaButtonEl.textContent = cta.buttonText + ' ';
        if (icon) ctaButtonEl.appendChild(icon);
      }
      if (cta.buttonLink) ctaButtonEl.setAttribute('href', cta.buttonLink);
    }
  }

  let featuredContentState = { enabled: true };

  function applyPageContent(content) {
    if (!content) return;

    applyHero(content.hero);
    applyWorkStrip(content.workStrip);
    featuredContentState = applyFeaturedWorkContent(content.featuredWork);
    applyAllProjectsContent(content.allProjects);
    applyTestimonialSection(content.testimonialSection);
    applyCta(content.cta);

    renderFilterBar(content.filters);
  }

  async function loadPageContent() {
    try {
      const response = await fetch(`${API_BASE}/api/portfolio/page-content`, { credentials: 'omit' });
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.success) applyPageContent(data.data);
    } catch {
      // Non-critical: the page already has sensible static fallback
      // content/markup for hero, CTA, and filters if this request fails.
    }
  }

  function cardHtml(project) {
    const filterSlug = CATEGORY_TO_FILTER[project.category] || 'other';

    // "View Details" always points at the internal Case Study page via
    // the project's slug — never at the external projectUrl (spec:
    // sections 13/14/48/60/TEST 10). If there's no usable slug the card
    // still renders, just without a details link, rather than emitting
    // an unsafe/undefined URL.
    const detailsHref = caseStudyUrl(project);

    // Analytics: identifies which project by its safe slug (never the
    // raw title/description), tracked when the visitor actually opens
    // the project (thumb or title click) rather than on render — a
    // render just means the card was fetched, not viewed/engaged with.
    const trackAttr = `data-portfolio-track="${escapeHtml(project.slug || project._id || '')}"`;

    const media = renderProjectMedia(project, false);
    const thumb = detailsHref
      ? `<a href="${escapeHtml(detailsHref)}" class="portfolio-thumb-link" ${trackAttr}><div class="portfolio-thumb">${media}</div></a>`
      : `<div class="portfolio-thumb">${media}</div>`;

    const titleInner = `${escapeHtml(project.title)} ${arrowIconSvg()}`;
    const titleMarkup = detailsHref
      ? `<a href="${escapeHtml(detailsHref)}" class="portfolio-title" ${trackAttr}>${titleInner}</a>`
      : `<div class="portfolio-title">${escapeHtml(project.title)}</div>`;

    const viewDetails = detailsHref
      ? `<a href="${escapeHtml(detailsHref)}" class="portfolio-view-details" ${trackAttr}>View Details ${arrowIconSvg()}</a>`
      : '';

    return `
      <div class="portfolio-item" data-category="${filterSlug}" data-id="${escapeHtml(project._id || project.slug)}">
        ${thumb}
        <div class="portfolio-info">
          <div class="portfolio-cat">${escapeHtml(project.category)}</div>
          ${titleMarkup}
          ${project.shortDescription ? `<p class="portfolio-desc">${escapeHtml(project.shortDescription)}</p>` : ''}
          ${project.clientName ? `<p class="portfolio-client">${escapeHtml(project.clientName)}</p>` : ''}
          ${viewDetails}
        </div>
      </div>
    `;
  }

  /**
   * Featured Work renders as an editorial layout rather than a uniform
   * grid (spec: sections 8/77): the first project gets a large
   * horizontal showcase card, remaining projects render as two (or
   * fewer) supporting cards alongside it. `variant` is 'primary' or
   * 'secondary' and only affects card sizing/class, not the underlying
   * data or link behavior.
   */
  function featuredCardHtml(project, variant, index, eagerMedia) {
    const filterSlug = CATEGORY_TO_FILTER[project.category] || 'other';
    // Featured cards use the same internal Case Study routing as the
    // grid cards — projectUrl (the external live site) is never used
    // for "View Details" navigation (spec: sections 13/14).
    const href = caseStudyUrl(project) || '#portfolio-work';
    const trackAttr = `data-portfolio-track="${escapeHtml(project.slug || project._id || '')}"`;
    const media = renderProjectMedia(project, eagerMedia);
    const cardClass = variant === 'primary' ? 'work-card work-card-primary' : 'work-card work-card-secondary';

    return `
      <a href="${escapeHtml(href)}" class="${cardClass} reveal reveal-stagger" ${trackAttr} data-category="${filterSlug}" style="--stagger-delay:${index * 90}ms">
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

  /**
   * Re-runs main.js's reveal-on-scroll observation for elements added
   * after the initial DOMContentLoaded pass (main.js's own
   * IntersectionObserver only ever sees elements present at that time).
   * Scoped to the given container so it doesn't touch unrelated .reveal
   * elements elsewhere on the page.
   */
  function observeRevealFor(container) {
    if (!container) return;
    const items = container.querySelectorAll('.reveal');
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

  /**
   * Renders the Featured Work section from the already-fetched published
   * project list (published + featured, capped at the admin-configured
   * maxProjects) rather than issuing a second network request — the same
   * /api/portfolio response backs both this section and All Projects.
   */
  function renderFeaturedWork() {
    if (!featuredSection) return;

    if (!featuredContentState.enabled) {
      featuredSection.hidden = true;
      return;
    }

    const featuredProjects = projects
      .filter((p) => p.featured === true)
      .slice(0, featuredMaxProjects);

    if (featuredProjects.length === 0) {
      featuredSection.hidden = true;
      return;
    }

    if (featuredGrid) {
      // First project is the large editorial showcase (eager-loaded
      // since it's the primary above-the-fold Featured image, spec:
      // section 24); remaining projects render as smaller supporting
      // cards wrapped in a row so they lay out two-across rather than
      // stacking full-width (spec: section 8).
      const [primary, ...rest] = featuredProjects;
      const primaryHtml = featuredCardHtml(primary, 'primary', 0, true);
      const restHtml = rest
        .map((project, idx) => featuredCardHtml(project, 'secondary', idx + 1, false))
        .join('');

      featuredGrid.innerHTML = restHtml
        ? `${primaryHtml}<div class="work-secondary-row">${restHtml}</div>`
        : primaryHtml;
      featuredGrid.classList.toggle('work-grid-editorial', featuredProjects.length > 1);
      observeRevealFor(featuredGrid);
      wireCardMedia(featuredGrid);
    }
    featuredSection.hidden = false;
  }

  function render() {
    grid.innerHTML = projects.map(cardHtml).join('');
    wireCardMedia(grid);
    applyFilter(activeFilter);
    renderFeaturedWork();
  }

  function applyFilter(filter) {
    activeFilter = filter;
    const items = grid.querySelectorAll('.portfolio-item');
    let visibleCount = 0;

    items.forEach((item) => {
      const matches = filter === 'all' || item.dataset.category === filter;
      item.classList.toggle('is-hidden', !matches);
      if (matches) visibleCount += 1;
    });

    const showNoFilterResults = projects.length > 0 && visibleCount === 0;
    noFilterResultsEl.hidden = !showNoFilterResults;
    grid.hidden = showNoFilterResults;
  }

  if (filterBar) {
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      filterBar.querySelectorAll('.filter-btn').forEach((b) => {
        b.classList.remove('is-active');
        b.removeAttribute('aria-current');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-current', 'true');
      applyFilter(btn.dataset.filter);
    });
  }

  // Analytics: portfolio_view fires on an actual open (thumb/title
  // click), not on render. Delegated at the document level so it covers
  // both the All Projects grid and the Featured Work grid with a single
  // listener, regardless of re-renders. Only one portfolio_view event
  // type is used — no duplicate/parallel event is introduced for the
  // Featured section.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-portfolio-track]');
    if (!el || !window.STSKAnalytics) return;
    window.STSKAnalytics.trackPortfolioView(el.getAttribute('data-portfolio-track'));
  });

  function showState(state) {
    loadingEl.hidden = state !== 'loading';
    errorEl.hidden = state !== 'error';
    emptyStateEl.hidden = state !== 'empty';
    grid.hidden = state !== 'ready';
    noFilterResultsEl.hidden = true;

    // While projects are loading/erroring/empty, Featured Work has
    // nothing to show either — keep it hidden rather than showing an
    // empty section ahead of the status message.
    if (state !== 'ready' && featuredSection) featuredSection.hidden = true;
  }

  async function loadPortfolio() {
    showState('loading');

    let response;
    try {
      response = await fetch(`${API_BASE}/api/portfolio`, { credentials: 'omit' });
    } catch (networkErr) {
      showState('error');
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data || !data.success) {
      showState('error');
      return;
    }

    projects = data.data.projects || [];

    if (projects.length === 0) {
      showState('empty');
      return;
    }

    showState('ready');
    render();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // Page content (filters, section visibility, featured maxProjects in
    // particular) should be in place before the grids render, so cards
    // aren't mis-filtered against stale/default filter buttons for a
    // frame and Featured Work knows its cap before rendering. If the
    // page-content request fails, loadPortfolio() still runs against the
    // static fallback markup already in the DOM — a page-content error
    // never blocks the project grid from loading (spec: section 32).
    await loadPageContent();
    loadPortfolio();
  });
})();