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
   * Extracts a Google Drive file ID from a raw Drive share/view URL or
   * returns the raw string if it's already a bare file ID. Returns '' for
   * empty/null input. Used to detect when a Drive URL was accidentally
   * saved into the `video` field (via "Paste URL" mode) instead of into
   * `driveVideoId` — that URL would be blocked by the browser's CSP when
   * used as a <video src>, so we normalise it here and treat it the same
   * as driveVideoId.
   */
  function extractDriveFileId(raw) {
    if (!raw) return '';
    const match = raw.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/);
    return match ? match[1] : '';
  }

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
   *
   * Special case: if `project.video` is a Google Drive share URL (e.g.
   * https://drive.google.com/file/d/.../view?usp=sharing), it cannot be
   * used as a <video src> — the browser blocks it with a CSP/CORP error.
   * We detect this and treat it as a driveVideoId instead, falling back
   * to the poster/image with a play-button overlay (same as the
   * explicit driveVideoId path). The admin should use the "Google Drive"
   * tab in the Edit Project modal going forward so the ID is stored in
   * the correct field.
   */
  function renderProjectMedia(project, eager) {
    const placeholder = 'assets/images/logo-mark-small.png';
    const alt = escapeHtml(project.title || '');
    const loadingAttr = eager ? '' : ' loading="lazy"';

    // Resolve effective Drive ID: prefer the dedicated driveVideoId field,
    // but also handle the case where a Drive URL was accidentally pasted
    // into the `video` URL field (the "Paste URL" tab in the admin modal).
    const effectiveDriveId = project.driveVideoId
      || (project.video ? extractDriveFileId(project.video) : '');

    // Determine if the `video` field holds a real non-Drive hosted URL
    // (mp4/webm CDN link, /uploads/ path, etc.) that is safe to use as
    // a <video src>. A Drive URL in this field must be treated as a
    // driveVideoId instead (see comment above).
    const videoIsDriveUrl = project.video && extractDriveFileId(project.video) !== '';
    const safeVideoSrc = project.video && !videoIsDriveUrl ? project.video : null;

    // Google Drive video card: show poster/image with a play-button overlay.
    // Can't embed a Drive iframe in a listing card (too heavy), so the image
    // + play icon communicates "this is a video" and clicking opens the full
    // case study page where the Drive player embeds without any YouTube logo.
    if (effectiveDriveId && !safeVideoSrc) {
      const thumbSrc = project.videoPoster
        ? escapeHtml(resolveMediaUrl(project.videoPoster))
        : project.image
          ? escapeHtml(resolveMediaUrl(project.image))
          : escapeHtml(placeholder);
      return `<div class="project-media drive-video-card" style="position:relative;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden;">
        <img src="${thumbSrc}" alt="${alt}"${loadingAttr} style="width:100%;height:100%;object-fit:cover;opacity:0.85;" onerror="this.onerror=null;this.src='${escapeHtml(placeholder)}'">
        <div style="position:absolute;width:48px;height:48px;background:rgba(255,255,255,0.92);border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#222" style="margin-left:2px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>`;
    }

    if (safeVideoSrc) {
      // safeVideoSrc is guaranteed to NOT be a Google Drive URL (Drive URLs
      // are handled above via the effectiveDriveId path). This prevents the
      // ERR_BLOCKED_BY_RESPONSE / CSP error that occurs when a Drive share
      // link is used directly as a <video src>.
      const videoSrc = escapeHtml(resolveMediaUrl(safeVideoSrc));
      const posterFallback = project.image ? resolveMediaUrl(project.image) : placeholder;
      const posterSrc = project.videoPoster ? escapeHtml(resolveMediaUrl(project.videoPoster)) : escapeHtml(posterFallback);
      // onerror fallback: if the video itself fails to load, swap the
      // whole element for the poster/placeholder image so the card never
      // shows a broken player (spec: section 25).
      return `<video class="project-media" src="${videoSrc}" poster="${posterSrc}" muted loop playsinline preload="metadata" aria-label="${alt}" onerror="this.replaceWith(Object.assign(document.createElement('img'),{src:'${posterSrc}',alt:'${alt}',className:'project-media'}))"></video>`;
    }

    const imgSrc = project.image ? escapeHtml(resolveMediaUrl(project.image)) : escapeHtml(placeholder);
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

  // Premium video treatment: a "Video" badge (always visible) plus a glass
  // play button (revealed on hover/focus) on any project that has a video.
  function hasVideo(project) {
    return Boolean(project.video || project.driveVideoId);
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
    const thumb = detailsHref
      ? `<a href="${escapeHtml(detailsHref)}" class="portfolio-thumb-link" ${trackAttr}><div class="portfolio-thumb">${media}${videoOverlayHtml(project)}</div></a>`
      : `<div class="portfolio-thumb">${media}${videoOverlayHtml(project)}</div>`;

    const titleInner = `${escapeHtml(project.title)} ${arrowIconSvg()}`;
    const titleMarkup = detailsHref
      ? `<a href="${escapeHtml(detailsHref)}" class="portfolio-title" ${trackAttr}>${titleInner}</a>`
      : `<div class="portfolio-title">${escapeHtml(project.title)}</div>`;

    const viewDetails = detailsHref
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
    const cardClass = (variant === 'primary' ? 'work-card work-card-primary' : 'work-card work-card-secondary') + (hasVideo(project) ? ' is-video' : '');

    return `
      <a href="${escapeHtml(href)}" class="${cardClass} reveal reveal-stagger" ${trackAttr} data-category="${filterSlug}" style="--stagger-delay:${index * 90}ms">
        <div class="work-thumb">${media}${videoOverlayHtml(project)}</div>
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

  document.addEventListener('DOMContentLoaded', loadPortfolio);
})();
