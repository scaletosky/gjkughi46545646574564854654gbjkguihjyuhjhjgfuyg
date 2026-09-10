/* ============================================================
   PHASE 9 — Dynamic Project Case Study page
   Loads a single published project by slug from the existing Phase 6
   public single-project API (GET /api/portfolio/:slug) and renders a
   premium, editorial case-study page. Every field comes from the
   Portfolio API response — nothing here is hardcoded project content.
   Reuses the same API_BASE / escaping / media-fallback / reveal-on-
   scroll conventions already established in js/portfolio-public.js.
   ============================================================ */

(function () {
  const content = document.getElementById('case-study-content');
  if (!content) return; // not on the Case Study page

  const API_BASE = window.STSK_API_BASE || '';

  const loadingEl = document.getElementById('case-study-loading');
  const errorEl = document.getElementById('case-study-error');
  const errorHeadingEl = document.getElementById('case-study-error-heading');
  const errorBodyEl = document.getElementById('case-study-error-body');

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // Renders plain admin text as safe DOM paragraphs — never innerHTML on
  // raw admin content (spec: section 46). Splits on blank lines so a
  // long case-study field reads as separate paragraphs rather than one
  // wall of text; single-line values still get a single <p>.
  function renderParagraphs(container, text) {
    container.innerHTML = '';
    if (!text) return;
    const paragraphs = String(text)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    (paragraphs.length ? paragraphs : [String(text).trim()]).forEach((p) => {
      const el = document.createElement('p');
      el.className = 'body-text';
      el.textContent = p;
      container.appendChild(el);
    });
  }

  function showState(state) {
    // states: 'loading' | 'error' | 'ready'
    if (loadingEl) loadingEl.hidden = state !== 'loading';
    if (errorEl) errorEl.hidden = state !== 'error';
    content.hidden = state !== 'ready';
  }

  function showError(heading, body) {
    if (errorHeadingEl) errorHeadingEl.textContent = heading;
    if (errorBodyEl) errorBodyEl.textContent = body;
    showState('error');
  }

  // ---- Slug resolution (spec: sections 2/42) ----
  const params = new URLSearchParams(window.location.search);
  const slug = (params.get('slug') || '').trim();

  if (!slug) {
    showError('Project not found', "No project was specified. Head back to see our full body of work.");
  } else {
    loadProject(slug);
  }

  async function loadProject(rawSlug) {
    showState('loading');

    let response;
    try {
      response = await fetch(`${API_BASE}/api/portfolio/${encodeURIComponent(rawSlug)}`, { credentials: 'omit' });
    } catch {
      showError("We couldn't load this project right now.", 'Please check your connection and try again.');
      return;
    }

    if (response.status === 404) {
      showError('Project not found', "The project you're looking for isn't available.");
      return;
    }

    if (!response.ok) {
      showError("We couldn't load this project right now.", 'Please try again in a moment.');
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!data || !data.success || !data.data || !data.data.project) {
      showError("We couldn't load this project right now.", 'Please try again in a moment.');
      return;
    }

    try {
      renderProject(data.data.project);
      showState('ready');
    } catch (err) {
      // A malformed/unexpected field shape should never blank the page
      // (spec: section 45) — surface a graceful error instead of a
      // half-rendered or crashed view.
      if (window.STSK_DEBUG) console.error('[portfolio-project] render error:', err);
      showError("We couldn't load this project right now.", 'Please try again in a moment.');
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  function renderProject(project) {
    renderMeta(project);
    renderHero(project);
    renderTextSection('cs-description-section', 'cs-description-body', project.description);
    renderTextSection('cs-about-section', 'cs-about-body', project.aboutProject);
    renderTextSection('cs-challenge-section', 'cs-challenge-body', project.challenge);
    renderApproachAndServices(project);
    renderGallery(project.gallery);
    renderTextSection('cs-outcome-section', 'cs-outcome-body', project.outcome);
    renderResults(project.results);
    renderTestimonial(project.testimonial);
    observeReveal();
  }

  // ---- 34/35/36/37. SEO metadata ----
  function renderMeta(project) {
    const title = project.title ? `${project.title} | Scale To Sky` : 'Portfolio Project | Scale To Sky';
    document.title = title;

    const description = project.shortDescription
      || (project.description ? String(project.description).slice(0, 200) : 'Selected work from Scale To Sky.');

    const titleEl = document.getElementById('case-study-title');
    if (titleEl) titleEl.textContent = title;

    const descEl = document.getElementById('case-study-meta-description');
    if (descEl) descEl.setAttribute('content', description);

    const ogTitleEl = document.getElementById('case-study-og-title');
    if (ogTitleEl) ogTitleEl.setAttribute('content', title);

    const ogDescEl = document.getElementById('case-study-og-description');
    if (ogDescEl) ogDescEl.setAttribute('content', description);

    // Canonical/OG URL: built from the current page's real origin/path,
    // never a hardcoded or invented production domain (spec: section 36).
    const currentUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const canonicalEl = document.getElementById('case-study-canonical');
    if (canonicalEl) canonicalEl.setAttribute('href', currentUrl);
    const ogUrlEl = document.getElementById('case-study-og-url');
    if (ogUrlEl) ogUrlEl.setAttribute('content', currentUrl);

    // og:image: prefer the primary image, then videoPoster if the
    // project is video-led (spec: section 37).
    let ogImagePath = '';
    if (project.mediaType === 'video' && project.videoPoster) ogImagePath = project.videoPoster;
    else if (project.image) ogImagePath = project.image;
    else if (project.videoPoster) ogImagePath = project.videoPoster;

    let ogImageEl = document.querySelector('meta[property="og:image"]');
    if (ogImagePath) {
      const absoluteUrl = /^https?:\/\//i.test(ogImagePath) ? ogImagePath : `${window.location.origin}${API_BASE}${ogImagePath}`;
      if (!ogImageEl) {
        ogImageEl = document.createElement('meta');
        ogImageEl.setAttribute('property', 'og:image');
        document.head.appendChild(ogImageEl);
      }
      ogImageEl.setAttribute('content', absoluteUrl);
    } else if (ogImageEl) {
      ogImageEl.remove();
    }
  }

  // ---- Project Hero: image + title/meta in one editorial two-column
  // layout. Combines what were previously three separate sections
  // (Hero / Main Media / Project Information) into a single hero,
  // per the premium editorial redesign. ----
  function renderHero(project) {
    const kickerEl = document.getElementById('cs-hero-kicker');
    if (kickerEl) kickerEl.textContent = project.category || 'Our work';

    const titleEl = document.getElementById('cs-hero-title');
    if (titleEl) titleEl.textContent = project.title || '';

    const descEl = document.getElementById('cs-hero-description');
    if (descEl) {
      if (project.shortDescription) {
        descEl.textContent = project.shortDescription;
        descEl.hidden = false;
      } else {
        descEl.hidden = true;
      }
    }

    const metaWrap = document.getElementById('cs-hero-meta');
    const clientWrap = document.getElementById('cs-hero-meta-client');
    const clientValue = document.getElementById('cs-hero-meta-client-value');
    const industryWrap = document.getElementById('cs-hero-meta-industry');
    const industryValue = document.getElementById('cs-hero-meta-industry-value');
    const servicesWrap = document.getElementById('cs-hero-meta-services');
    const servicesValue = document.getElementById('cs-hero-meta-services-value');

    const hasClient = Boolean(project.clientName);
    const hasIndustry = Boolean(project.industry);
    const services = Array.isArray(project.services) ? project.services.filter(Boolean) : [];
    const hasServices = services.length > 0;

    if (clientWrap && clientValue) {
      clientWrap.hidden = !hasClient;
      if (hasClient) clientValue.textContent = project.clientName;
    }
    if (industryWrap && industryValue) {
      industryWrap.hidden = !hasIndustry;
      if (hasIndustry) industryValue.textContent = project.industry;
    }
    if (servicesWrap && servicesValue) {
      servicesWrap.hidden = !hasServices;
      if (hasServices) servicesValue.textContent = services.join(' \u00b7 ');
    }
    if (metaWrap) metaWrap.hidden = !(hasClient || hasIndustry || hasServices);

    renderLiveProjectLink(project.projectUrl);
    renderMainMedia(project);
  }

  // ---- Live Project link, now a small contextual link inside the
  // hero info column rather than a standalone section/button. ----
  function isSafeExternalUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function renderLiveProjectLink(projectUrl) {
    const link = document.getElementById('cs-live-project-link');
    if (!link) return;

    if (!isSafeExternalUrl(projectUrl)) {
      link.hidden = true;
      link.removeAttribute('href');
      return;
    }

    link.setAttribute('href', projectUrl);
    link.hidden = false;
  }

  // ---- 09/10/19/20/21. Main media (image or video), with fallback
  // chain: video -> videoPoster -> image -> neutral placeholder
  // (spec: sections 21/78/79). ----
  const PLACEHOLDER_IMAGE = 'assets/images/logo-mark-small.png';

  function mediaUrl(path) {
    if (!path) return '';
    return /^https?:\/\//i.test(path) || path.startsWith('/uploads/') ? `${API_BASE}${path}` : path;
  }

  function renderMainMedia(project) {
    const wrap = document.getElementById('cs-main-media');
    if (!wrap) return;

    const alt = escapeHtml(project.title || '');

    // Video takes priority whenever it's present, regardless of
    // `mediaType` — a project can carry both an image and a video
    // (image doubling as poster/fallback), so `project.video` alone is
    // the signal to show a video.
    if (project.video) {
      const videoSrc = escapeHtml(mediaUrl(project.video));
      const posterFallback = project.videoPoster || project.image || '';
      const posterSrc = posterFallback ? escapeHtml(mediaUrl(posterFallback)) : '';
      wrap.innerHTML = `<video class="cs-hero-media" src="${videoSrc}"${posterSrc ? ` poster="${posterSrc}"` : ''} muted loop playsinline preload="metadata" aria-label="${alt}"></video>`;

      const videoEl = wrap.querySelector('video');
      if (videoEl) {
        // If the primary video itself fails, fall back to poster/image/
        // placeholder rather than showing a broken player (spec: 21/25).
        videoEl.addEventListener('error', () => {
          const fallback = project.videoPoster || project.image || PLACEHOLDER_IMAGE;
          wrap.innerHTML = `<img class="cs-hero-media" src="${escapeHtml(mediaUrl(fallback) || PLACEHOLDER_IMAGE)}" alt="${alt}">`;
        }, { once: true });

        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduceMotion) {
          videoEl.play().catch(() => {}); // best-effort; poster remains if blocked
        }
      }
      return;
    }

    // Image path, or video project missing a usable video URL — fall
    // back through image -> placeholder (spec: section 77/78).
    const imgSrc = mediaUrl(project.image) || PLACEHOLDER_IMAGE;
    wrap.innerHTML = `<img class="cs-hero-media" src="${escapeHtml(imgSrc)}" alt="${alt}" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}'">`;
  }

  // ---- 12/13. Generic optional text section (About/Challenge/Outcome) ----
  function renderTextSection(sectionId, bodyId, text) {
    const section = document.getElementById(sectionId);
    const body = document.getElementById(bodyId);
    if (!section || !body) return;

    if (!text) {
      section.hidden = true;
      body.innerHTML = '';
      return;
    }

    renderParagraphs(body, text);
    section.hidden = false;
  }

  // ---- 14/15. What We Did (approach + solution) + Services tags ----
  function renderApproachAndServices(project) {
    const section = document.getElementById('cs-approach-section');
    const body = document.getElementById('cs-approach-body');
    if (section && body) {
      const hasApproach = Boolean(project.approach);
      const hasSolution = Boolean(project.solution);

      if (!hasApproach && !hasSolution) {
        section.hidden = true;
        body.innerHTML = '';
      } else {
        body.innerHTML = '';
        if (hasApproach) {
          renderParagraphs(body, project.approach);
        }
        if (hasSolution) {
          const solutionKicker = document.createElement('p');
          solutionKicker.className = 'cs-inline-kicker';
          solutionKicker.textContent = 'The solution';
          body.appendChild(solutionKicker);
          const solutionWrap = document.createElement('div');
          renderParagraphs(solutionWrap, project.solution);
          Array.from(solutionWrap.children).forEach((el) => body.appendChild(el));
        }
        section.hidden = false;
      }
    }

    const servicesSection = document.getElementById('cs-services-section');
    const servicesList = document.getElementById('cs-services-list');
    if (servicesSection && servicesList) {
      const services = Array.isArray(project.services) ? project.services.filter(Boolean) : [];
      if (services.length === 0) {
        servicesSection.hidden = true;
        servicesList.innerHTML = '';
      } else {
        servicesList.innerHTML = services
          .map((s) => `<span class="cs-service-tag">${escapeHtml(s)}</span>`)
          .join('');
        servicesSection.hidden = false;
      }
    }
  }

  // ---- 16/17/18/19/20/21. Media Gallery ----
  // Shared IntersectionObserver so gallery videos only load/play near
  // the viewport and pause when scrolled away (spec: section 20/57).
  // Also enforces at most one actively playing gallery video at a time
  // (spec: section 17) — the 2-up layout can put two video items in
  // the viewport simultaneously.
  let galleryObserver = null;
  let currentlyPlayingGalleryVideo = null;
  function getGalleryObserver() {
    if (galleryObserver) return galleryObserver;
    if (!('IntersectionObserver' in window)) return null;
    galleryObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          if (entry.isIntersecting) {
            if (currentlyPlayingGalleryVideo && currentlyPlayingGalleryVideo !== video) {
              currentlyPlayingGalleryVideo.pause();
            }
            currentlyPlayingGalleryVideo = video;
            video.play().catch(() => {});
          } else {
            video.pause();
            if (currentlyPlayingGalleryVideo === video) currentlyPlayingGalleryVideo = null;
          }
        });
      },
      { threshold: 0.3 }
    );
    return galleryObserver;
  }

  function galleryItemHtml(item, index) {
    const alt = escapeHtml(item.caption || `Project media ${index + 1}`);
    const caption = item.caption
      ? `<p class="cs-gallery-caption">${escapeHtml(item.caption)}</p>`
      : '';

    if (item.type === 'video' && item.url) {
      const src = escapeHtml(mediaUrl(item.url));
      const poster = item.poster ? escapeHtml(mediaUrl(item.poster)) : '';
      return `
        <figure class="cs-gallery-item" data-gallery-index="${index}">
          <div class="cs-gallery-media">
            <video class="cs-gallery-video" src="${src}"${poster ? ` poster="${poster}"` : ''} muted loop playsinline preload="none" aria-label="${alt}"></video>
          </div>
          ${caption}
        </figure>`;
    }

    if (item.type === 'image' && item.url) {
      const src = escapeHtml(mediaUrl(item.url));
      return `
        <figure class="cs-gallery-item" data-gallery-index="${index}">
          <div class="cs-gallery-media">
            <img class="cs-gallery-img" src="${src}" alt="${alt}" loading="lazy" onerror="this.closest('.cs-gallery-item').remove()">
          </div>
          ${caption}
        </figure>`;
    }

    // Invalid item (missing url or unknown type) — skip entirely rather
    // than breaking the rest of the gallery (spec: section 79).
    return '';
  }

  function renderGallery(gallery) {
    const section = document.getElementById('cs-gallery-section');
    const wrap = document.getElementById('cs-gallery');
    if (!section || !wrap) return;

    const items = Array.isArray(gallery) ? gallery.filter((g) => g && g.url && (g.type === 'image' || g.type === 'video')) : [];

    if (items.length === 0) {
      section.hidden = true;
      wrap.innerHTML = '';
      return;
    }

    // Sort by displayOrder ascending; stable fallback preserves
    // original array order for equal/missing displayOrder values
    // (spec: section 16).
    const sorted = items
      .map((item, originalIndex) => ({ item, originalIndex }))
      .sort((a, b) => {
        const orderA = Number.isFinite(a.item.displayOrder) ? a.item.displayOrder : 0;
        const orderB = Number.isFinite(b.item.displayOrder) ? b.item.displayOrder : 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.originalIndex - b.originalIndex;
      })
      .map((entry) => entry.item);

    // Adaptive editorial layout: large / 2-up / large / 2-up... (spec:
    // section 17). Every 3rd item (0-indexed: 0, 3, 6...) is full-width.
    wrap.innerHTML = sorted
      .map((item, i) => galleryItemHtml(item, i))
      .join('');

    // Assign layout classes based on position among successfully
    // rendered items (invalid items already produced empty strings and
    // are absent from the DOM).
    const renderedItems = wrap.querySelectorAll('.cs-gallery-item');
    if (renderedItems.length === 0) {
      section.hidden = true;
      return;
    }
    renderedItems.forEach((el, i) => {
      el.classList.add(i % 3 === 0 ? 'cs-gallery-item-full' : 'cs-gallery-item-half');
      el.classList.add('reveal');
    });

    // Wire video playback via shared observer; respect reduced motion.
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const videos = wrap.querySelectorAll('video.cs-gallery-video');
    videos.forEach((v) => {
      if (reduceMotion) return;
      const observer = getGalleryObserver();
      if (observer) observer.observe(v);
    });

    section.hidden = false;
  }

  // ---- 23/24/60. Results / Metrics ----
  function renderResults(results) {
    const section = document.getElementById('cs-results-section');
    const grid = document.getElementById('cs-results-grid');
    if (!section || !grid) return;

    const valid = Array.isArray(results)
      ? results.filter((r) => r && r.label && r.value)
      : [];

    if (valid.length === 0) {
      section.hidden = true;
      grid.innerHTML = '';
      return;
    }

    const sorted = valid
      .map((item, originalIndex) => ({ item, originalIndex }))
      .sort((a, b) => {
        const orderA = Number.isFinite(a.item.displayOrder) ? a.item.displayOrder : 0;
        const orderB = Number.isFinite(b.item.displayOrder) ? b.item.displayOrder : 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.originalIndex - b.originalIndex;
      })
      .map((entry) => entry.item);

    // Values are rendered exactly as stored — no numeric parsing, no
    // added "+", no unit conversion (spec: section 60).
    grid.innerHTML = sorted
      .map(
        (r) => `
        <div class="stat-item">
          <div class="stat-num">${escapeHtml(r.value)}</div>
          <div class="stat-label">${escapeHtml(r.label)}</div>
          ${r.description ? `<div class="cs-result-desc">${escapeHtml(r.description)}</div>` : ''}
        </div>`
      )
      .join('');

    section.hidden = false;
  }

  // ---- 25/26/61. Client Testimonial ----
  function renderTestimonial(testimonial) {
    const section = document.getElementById('cs-testimonial-section');
    if (!section) return;

    if (!testimonial || !testimonial.quote || !testimonial.name) {
      section.hidden = true;
      return;
    }

    const quoteEl = document.getElementById('cs-testimonial-quote');
    const nameEl = document.getElementById('cs-testimonial-name');
    const roleEl = document.getElementById('cs-testimonial-role');
    const avatarEl = document.getElementById('cs-testimonial-avatar');

    if (quoteEl) quoteEl.textContent = `"${testimonial.quote}"`;
    if (nameEl) nameEl.textContent = testimonial.name;
    if (roleEl) roleEl.textContent = [testimonial.role, testimonial.company].filter(Boolean).join(', ');
    if (avatarEl) avatarEl.textContent = testimonial.initials || '';

    section.hidden = false;
  }

  // ---- Reveal-on-scroll for dynamically inserted content (main.js's
  // own pass only covers elements present at its DOMContentLoaded run,
  // which is before this content exists). Mirrors observeRevealFor in
  // js/portfolio-public.js. ----
  function observeReveal() {
    const items = content.querySelectorAll('.reveal:not(.is-visible)');
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
      el.style.setProperty('--stagger-delay', `${(index % 6) * 90}ms`);
      observer.observe(el);
    });
  }
})();