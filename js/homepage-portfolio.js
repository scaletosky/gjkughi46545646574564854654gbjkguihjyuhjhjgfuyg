/* ============================================================
   Homepage "Selected work" preview.
   Only the projects come from the Super Admin backend
   (GET /api/portfolio/featured — featured + published first,
   filled with other published projects, capped at 3 server-side).
   Heading and button are static HTML in index.html.
   Renders .work-card markup (shared CSS with the Portfolio page).
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
   * 10/25/58/65). Mirrors js/portfolio-public.js so Homepage and the
   * Portfolio page render every project identically.
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
  function renderProjectMedia(project) {
    const placeholder = 'assets/images/logo-mark-small.png';
    const alt = escapeHtml(project.title || '');
    const loadingAttr = ' loading="lazy"';

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

  document.addEventListener('DOMContentLoaded', loadFeaturedProjects);
})();