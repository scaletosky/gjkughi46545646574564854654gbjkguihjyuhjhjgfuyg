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
  // path on the library's pull zone — used for the card's poster image
  // when the admin left Video Poster on "Auto" (videoPosterMode).
  function bunnyThumbnailUrl(bunnyVideoId) {
    if (!BUNNY_PULL_ZONE) return '';
    return `https://${BUNNY_PULL_ZONE}/${encodeURIComponent(bunnyVideoId)}/thumbnail.jpg`;
  }

  // Same iframe embed Bunny Stream uses on the Case Study / Portfolio
  // pages (controls=false strips Bunny's native bar so it doesn't
  // overflow the compact 9:16 card — our own .pf-play-toggle button is
  // the only playback control, same pattern as portfolio-public.js).
  function bunnyEmbedUrl(bunnyVideoId) {
    return `https://iframe.mediadelivery.net/embed/${encodeURIComponent(BUNNY_LIBRARY_ID)}/${encodeURIComponent(bunnyVideoId)}?autoplay=true&responsive=true&controls=false`;
  }

  /**
   * Renders a project's primary media as image or video with a safe
   * fallback chain: Bunny video (poster card) -> image -> placeholder.
   * Never lets a missing/broken source collapse the card (spec:
   * sections 10/25/58/65). Mirrors js/portfolio-public.js so Homepage
   * and the Portfolio page render every project identically.
   *
   * A video project's media sits inside a non-navigating
   * .portfolio-thumb-play button (plays the Bunny embed in place, 9:16,
   * same compact "premium" card as the Portfolio page) instead of
   * linking out — only the title/"View Details" below still link to
   * the Case Study page.
   */
  function renderProjectMedia(project) {
    const placeholder = 'assets/images/logo-mark-small.png';
    const alt = escapeHtml(project.title || '');
    const loadingAttr = ' loading="lazy"';

    if (project.bunnyVideoId) {
      const customPoster = project.videoPosterMode === 'custom' && project.videoPoster
        ? resolveMediaUrl(project.videoPoster)
        : '';
      const autoThumb = bunnyThumbnailUrl(project.bunnyVideoId);
      const thumbSrc = customPoster || autoThumb || (project.image ? resolveMediaUrl(project.image) : placeholder);
      const poster = `<img src="${escapeHtml(thumbSrc)}" alt="${alt}"${loadingAttr} style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.onerror=null;this.src='${escapeHtml(placeholder)}'">` +
        `<span class="pf-vbadge"><i></i>Video</span>` +
        `<span class="pf-play" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg></span>`;
      return `<button type="button" class="portfolio-thumb-link portfolio-thumb-play" data-bunny-video-id="${escapeHtml(project.bunnyVideoId)}" aria-label="Play video: ${alt}"><div class="portfolio-thumb">${poster}</div></button>`;
    }

    const imgSrc = project.image ? escapeHtml(resolveMediaUrl(project.image)) : escapeHtml(placeholder);
    return `<img class="project-media" src="${imgSrc}" alt="${alt}"${loadingAttr} onerror="this.onerror=null;this.src='${escapeHtml(placeholder)}'">`;
  }

  // Delegated (survives re-renders) click handler for the
  // .portfolio-thumb-play buttons added in renderProjectMedia() above
  // — swaps the static thumbnail for Bunny's real iframe player and
  // plays it in place, instead of navigating anywhere. Mirrors
  // js/portfolio-public.js's identical handler on the Portfolio page.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.portfolio-thumb-play');
    if (!btn || !grid.contains(btn) || btn.classList.contains('is-playing')) return;

    const bunnyVideoId = btn.dataset.bunnyVideoId;
    if (!bunnyVideoId || !BUNNY_LIBRARY_ID) return;

    const thumb = btn.querySelector('.portfolio-thumb');
    if (!thumb) return;

    thumb.innerHTML = `<iframe class="portfolio-thumb-iframe" src="${bunnyEmbedUrl(bunnyVideoId)}" title="${btn.getAttribute('aria-label') || 'Project video'}" loading="lazy" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen></iframe>` +
      `<span class="pf-play pf-play-toggle" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg></span>`;
    btn.classList.add('is-playing');

    const iframe = thumb.querySelector('.portfolio-thumb-iframe');
    const toggle = thumb.querySelector('.pf-play-toggle');
    let playing = true;
    toggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      iframe.contentWindow.postMessage(JSON.stringify({
        method: playing ? 'pause' : 'play'
      }), 'https://iframe.mediadelivery.net');
      playing = !playing;
      toggle.classList.toggle('is-paused', !playing);
    });
  });

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
    const isVideo = !!project.bunnyVideoId;
    // Editorial layout (Phase 9): first featured project renders larger
    // via .work-card-primary (existing CSS, previously only used by the
    // Portfolio page). Purely a class addition — markup, data source and
    // href/media logic are otherwise identical for every card.
    const primaryClass = isPrimary ? ' work-card-primary' : '';
    const videoClass = isVideo ? ' is-video' : '';
    // A video card's thumb is its own non-navigating play button (see
    // renderProjectMedia), so the outer wrapper is a <div> instead of
    // an <a> — only the title/"View Details" link below still
    // navigates to the Case Study page.
    const Tag = isVideo ? 'div' : 'a';
    const hrefAttr = isVideo ? '' : ` href="${escapeHtml(href)}"`;

    return `
      <${Tag}${hrefAttr} class="work-card${primaryClass}${videoClass} reveal reveal-stagger" ${trackAttr} data-category="${filterSlug}">
        <div class="work-thumb">${media}</div>
        <div class="work-meta">
          <div>
            <div class="work-category">${escapeHtml(project.category)}</div>
            <div class="work-name">${escapeHtml(project.title)}</div>
            ${project.shortDescription ? `<p class="work-desc">${escapeHtml(project.shortDescription)}</p>` : ''}
            ${project.clientName ? `<p class="work-client">${escapeHtml(project.clientName)}</p>` : ''}
            <a href="${escapeHtml(href)}" class="work-view-details">View Details <svg class="work-arrow-inline" viewBox="0 0 18 18" fill="none"><path d="M4 14L14 4M6 4h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
          </div>
          ${isVideo ? '' : '<svg class="work-arrow" viewBox="0 0 18 18" fill="none"><path d="M4 14L14 4M6 4h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'}
        </div>
      </${Tag}>
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
  }

  document.addEventListener('DOMContentLoaded', loadFeaturedProjects);
})();