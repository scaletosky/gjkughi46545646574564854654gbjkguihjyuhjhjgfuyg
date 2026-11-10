/* ============================================================
   Public Portfolio page.
   Only the projects come from the Super Admin backend
   (GET /api/portfolio — published projects). All page copy
   (hero, headings, filters, CTA) is static HTML in portfolio.html.
   Renders the Featured Work section (featured projects, max 3),
   the All Projects grid and the category filters.
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
  if (!grid) return; // not on the portfolio page

  // ---- Featured Work elements ----
  const featuredSection = document.getElementById('portfolio-featured-section');
  const featuredGrid = document.getElementById('portfolio-featured-grid');

  let projects = [];
  let activeFilter = 'all';
  // Featured Work shows at most this many featured projects.
  const FEATURED_MAX_PROJECTS = 3;

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

  // Phase 12 — grid cards no longer render a native <video> element for
  // project media (Bunny video now shows as a poster-image card with a
  // play-button overlay, same reasoning the old Drive-card path used —
  // an iframe embed is too heavy for a grid of many cards), so the
  // play/pause-on-visibility IntersectionObserver this section used to
  // need is no longer applicable and has been removed along with it.

  const BUNNY_LIBRARY_ID = window.STSK_BUNNY_LIBRARY_ID || '';
  const BUNNY_PULL_ZONE = window.STSK_BUNNY_PULL_ZONE || '';

  /**
   * Resolves a stored media reference to a usable URL. Locally uploaded
   * files are stored as "/uploads/..." paths and live on the backend
   * origin (API_BASE); pasted hosted URLs (https://...) are already
   * absolute and must NOT be prefixed with API_BASE.
   */
  function resolveMediaUrl(path) {
    if (!path) return '';
    return /^https?:\/\//i.test(path) ? path : API_BASE + path;
  }

  // Bunny Stream auto-generates a thumbnail per video at this fixed
  // path on the library's pull zone.
  function bunnyThumbnailUrl(bunnyVideoId) {
    if (!BUNNY_PULL_ZONE) return '';
    return `https://${BUNNY_PULL_ZONE}/${encodeURIComponent(bunnyVideoId)}/thumbnail.jpg`;
  }

  // Same iframe embed Bunny Stream uses on the Case Study page
  // (portfolio-project.js's bunnyEmbedUrl) — reused here so a grid
  // card can play the video in place instead of only linking out to
  // the full project page.
  function bunnyEmbedUrl(bunnyVideoId) {
    // controls=false strips Bunny's native control bar (volume/gear/
    // fullscreen) so it doesn't overflow the narrower grid-card thumb;
    // our own centered .pf-play icon (kept visible via CSS) is the
    // only play/pause affordance on these compact cards.
    return `https://iframe.mediadelivery.net/embed/${encodeURIComponent(BUNNY_LIBRARY_ID)}/${encodeURIComponent(bunnyVideoId)}?autoplay=true&responsive=true&controls=false`;
  }

  /**
   * Renders a project's primary media as image or video with a safe
   * fallback chain: Bunny video (poster card) -> image -> placeholder.
   * Never lets a missing/broken source collapse the card (spec:
   * sections 10/25/58/65). `eager` requests eager-loading for the
   * single above-the-fold featured image only (spec: section 24).
   *
   * Phase 12 — a listing-grid card never embeds Bunny's iframe player
   * directly; it shows the video's poster/thumbnail image with a
   * play-button overlay instead, same as the old Drive-card pattern.
   * Clicking the card opens the full case study page, where the Bunny
   * player actually embeds and plays.
   */
  function renderProjectMedia(project, eager) {
    const placeholder = 'assets/images/logo-mark-small.png';
    const alt = escapeHtml(project.title || '');
    const loadingAttr = eager ? '' : ' loading="lazy"';

    if (project.bunnyVideoId) {
      const customPoster = project.videoPosterMode === 'custom' && project.videoPoster
        ? resolveMediaUrl(project.videoPoster)
        : '';
      const autoThumb = bunnyThumbnailUrl(project.bunnyVideoId);
      const thumbSrc = customPoster || autoThumb || (project.image ? resolveMediaUrl(project.image) : placeholder);
      return `<div class="project-media bunny-video-card" style="position:relative;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden;">
        <img src="${escapeHtml(thumbSrc)}" alt="${alt}"${loadingAttr} style="width:100%;height:100%;object-fit:cover;opacity:0.85;" onerror="this.onerror=null;this.src='${escapeHtml(placeholder)}'">
        <div style="position:absolute;width:48px;height:48px;background:rgba(255,255,255,0.92);border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#222" style="margin-left:2px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>`;
    }

    const imgSrc = project.image ? escapeHtml(resolveMediaUrl(project.image)) : escapeHtml(placeholder);
    return `<img class="project-media" src="${imgSrc}" alt="${alt}"${loadingAttr} onerror="this.onerror=null;this.src='${escapeHtml(placeholder)}'">`;
  }

  // Premium video treatment: a "Video" badge (always visible) plus a glass
  // play button (revealed on hover/focus) on any project that has a video.
  function hasVideo(project) {
    return Boolean(project.bunnyVideoId);
  }
  function videoOverlayHtml(project) {
    if (!hasVideo(project)) return '';
    return '<span class="pf-vbadge"><i></i>Video</span>' +
      '<span class="pf-play" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg></span>';
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

    // Video cards: clicking the thumbnail plays the video in place
    // (see bindVideoCardPlay) instead of opening the Case Study page,
    // so this is a non-navigating button rather than the <a> the
    // image-only path below still uses. "View Details" below remains
    // a normal link to the project page either way.
    const thumb = hasVideo(project)
      ? `<button type="button" class="portfolio-thumb-link portfolio-thumb-play" data-bunny-video-id="${escapeHtml(project.bunnyVideoId)}" aria-label="Play video: ${escapeHtml(project.title || '')}"><div class="portfolio-thumb">${media}${videoOverlayHtml(project)}</div></button>`
      : detailsHref
        ? `<a href="${escapeHtml(detailsHref)}" class="portfolio-thumb-link" ${trackAttr}><div class="portfolio-thumb">${media}${videoOverlayHtml(project)}</div></a>`
        : `<div class="portfolio-thumb">${media}${videoOverlayHtml(project)}</div>`;

    const titleInner = `${escapeHtml(project.title)} ${arrowIconSvg()}`;
    const titleMarkup = (detailsHref && !hasVideo(project))
      ? `<a href="${escapeHtml(detailsHref)}" class="portfolio-title" ${trackAttr}>${titleInner}</a>`
      : `<div class="portfolio-title">${escapeHtml(project.title)}</div>`;

    // No "View Details" link on video cards — they only play inline now,
    // there is no separate Case Study page to send visitors to for these.
    const viewDetails = (detailsHref && !hasVideo(project))
      ? `<a href="${escapeHtml(detailsHref)}" class="portfolio-view-details" ${trackAttr}>View Details ${arrowIconSvg()}</a>`
      : '';

    return `
      <div class="portfolio-item${hasVideo(project) ? ' is-video' : ''}" data-category="${filterSlug}" data-id="${escapeHtml(project._id || project.slug)}">
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
    const isVideo = hasVideo(project);
    const cardClass = (variant === 'primary' ? 'work-card work-card-primary' : 'work-card work-card-secondary') + (isVideo ? ' is-video' : '');
    const style = `style="--stagger-delay:${index * 90}ms"`;

    const meta = `
          <div>
            <div class="work-category">${escapeHtml(project.category)}</div>
            <div class="work-name">${escapeHtml(project.title)}</div>
            ${project.shortDescription ? `<p class="work-desc">${escapeHtml(project.shortDescription)}</p>` : ''}
            ${project.clientName ? `<p class="work-client">${escapeHtml(project.clientName)}</p>` : ''}
            ${isVideo ? '' : '<span class="work-view-details">View Details <svg class="work-arrow-inline" viewBox="0 0 18 18" fill="none"><path d="M4 14L14 4M6 4h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'}
          </div>
          ${isVideo ? '' : '<svg class="work-arrow" viewBox="0 0 18 18" fill="none"><path d="M4 14L14 4M6 4h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'}`;

    // Video cards: a non-navigating button whose thumb plays inline
    // (handled by the delegated .portfolio-thumb-play click listener
    // below) instead of linking out to the Case Study page — same
    // reasoning as the grid cards in cardHtml().
    if (isVideo) {
      return `
      <button type="button" class="${cardClass} reveal reveal-stagger portfolio-thumb-play" data-bunny-video-id="${escapeHtml(project.bunnyVideoId)}" aria-label="Play video: ${escapeHtml(project.title || '')}" data-category="${filterSlug}" ${style}>
        <div class="work-thumb portfolio-thumb">${media}${videoOverlayHtml(project)}</div>
        <div class="work-meta">${meta}</div>
      </button>
    `;
    }

    return `
      <a href="${escapeHtml(href)}" class="${cardClass} reveal reveal-stagger" ${trackAttr} data-category="${filterSlug}" ${style}>
        <div class="work-thumb">${media}${videoOverlayHtml(project)}</div>
        <div class="work-meta">${meta}</div>
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

    const featuredProjects = projects
      .filter((p) => p.featured === true)
      .slice(0, FEATURED_MAX_PROJECTS);

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
    }
    featuredSection.hidden = false;
  }

  function render() {
    grid.innerHTML = projects.map(cardHtml).join('');
    applyFilter(activeFilter);
    renderFeaturedWork();
  }

  // Delegated (survives re-renders/filtering, unlike binding per card)
  // click handler for the .portfolio-thumb-play buttons added in
  // cardHtml(): swaps the static thumbnail for Bunny's real iframe
  // player and plays it in place, instead of navigating to the Case
  // Study page. Delegated at the document level so it also covers the
  // Featured Work grid once/if that section adopts the same button
  // markup.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.portfolio-thumb-play');
    if (!btn || btn.classList.contains('is-playing')) return;

    const bunnyVideoId = btn.dataset.bunnyVideoId;
    if (!bunnyVideoId || !BUNNY_LIBRARY_ID) return;

    const thumb = btn.querySelector('.portfolio-thumb');
    if (!thumb) return;

    // controls=false (see bunnyEmbedUrl) strips Bunny's native bar, so
    // our own centered play/pause icon is layered back on top of the
    // iframe here and kept for the life of the card — nothing else.
    thumb.innerHTML = `<iframe class="portfolio-thumb-iframe" src="${bunnyEmbedUrl(bunnyVideoId)}" title="${btn.getAttribute('aria-label') || 'Project video'}" loading="lazy" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen></iframe>` +
      `<span class="pf-play pf-play-toggle" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg></span>`;
    // The button only exists to trigger this swap; once the real
    // player is in place, further clicks should hit our play/pause
    // toggle, not re-trigger this handler (guarded above via
    // is-playing, not btn.disabled — a disabled button blocks
    // pointer-events on its own descendants in most browsers, which
    // silently ate clicks on the toggle after the first pause/resume).
    btn.classList.add('is-playing');

    const iframe = thumb.querySelector('.portfolio-thumb-iframe');
    const toggle = thumb.querySelector('.pf-play-toggle');
    let playing = true;
    toggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // Bunny Stream's embed listens for this postMessage API to
      // control playback from outside the iframe.
      iframe.contentWindow.postMessage(JSON.stringify({
        method: playing ? 'pause' : 'play'
      }), 'https://iframe.mediadelivery.net');
      playing = !playing;
      toggle.classList.toggle('is-paused', !playing);
    });
  });

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

  document.addEventListener('DOMContentLoaded', loadPortfolio);
})();