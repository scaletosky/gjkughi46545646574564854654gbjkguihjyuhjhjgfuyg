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
    renderServices(project);
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

    // og:image: for a video-led project, prefer a custom videoPoster if
    // the admin set one, else Bunny's own auto-generated thumbnail;
    // otherwise fall back to the primary image (spec: section 37).
    let ogImagePath = '';
    let ogImageIsAbsolute = false;
    if (project.mediaType === 'video' && project.videoPosterMode === 'custom' && project.videoPoster) {
      ogImagePath = project.videoPoster;
    } else if (project.mediaType === 'video' && project.bunnyVideoId && BUNNY_PULL_ZONE) {
      ogImagePath = `https://${BUNNY_PULL_ZONE}/${encodeURIComponent(project.bunnyVideoId)}/thumbnail.jpg`;
      ogImageIsAbsolute = true;
    } else if (project.image) {
      ogImagePath = project.image;
    } else if (project.videoPoster) {
      ogImagePath = project.videoPoster;
    }

    let ogImageEl = document.querySelector('meta[property="og:image"]');
    if (ogImagePath) {
      const absoluteUrl = ogImageIsAbsolute || /^https?:\/\//i.test(ogImagePath)
        ? ogImagePath
        : `${window.location.origin}${API_BASE}${ogImagePath}`;
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
  // chain: Bunny video -> image -> neutral placeholder.
  // Phase 12 — Bunny Stream is the single video source; the old
  // Drive/YouTube/local-upload branches are gone. ----
  const PLACEHOLDER_IMAGE = 'assets/images/logo-mark-small.png';
  const BUNNY_LIBRARY_ID = window.STSK_BUNNY_LIBRARY_ID || '';
  const BUNNY_PULL_ZONE = window.STSK_BUNNY_PULL_ZONE || '';

  function mediaUrl(path) {
    if (!path) return '';
    return /^https?:\/\//i.test(path) || path.startsWith('/uploads/') ? `${API_BASE}${path}` : path;
  }

  // Bunny Stream's standard iframe embed URL — adaptive HLS, built-in
  // controls, works in any evergreen browser with no extra JS needed on
  // this site's side. responsive=true lets it fill its container.
  function bunnyEmbedUrl(bunnyVideoId) {
    return `https://iframe.mediadelivery.net/embed/${encodeURIComponent(BUNNY_LIBRARY_ID)}/${encodeURIComponent(bunnyVideoId)}?autoplay=false&responsive=true`;
  }

  function renderMainMedia(project) {
    const wrap = document.getElementById('cs-main-media');
    if (!wrap) return;

    const alt = escapeHtml(project.title || '');

    if (project.bunnyVideoId && BUNNY_LIBRARY_ID) {
      const embedSrc = bunnyEmbedUrl(project.bunnyVideoId);
      wrap.innerHTML = `<iframe class="cs-hero-media" src="${embedSrc}" title="${alt}" loading="lazy" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen></iframe>`;
      return;
    }

    // No Bunny video (image-type project, or a video project whose
    // upload hasn't been set yet) — fall back through image ->
    // placeholder (spec: section 77/78).
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

  // ---- Services tags. The case-study narrative sections (About,
  // Challenge, What We Did/Solution, Outcome, Results, Gallery,
  // Testimonial) were removed from the simplified admin form, so their
  // render logic was removed here too — Services is the one section
  // from that old group the admin asked to keep. ----
  function renderServices(project) {
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