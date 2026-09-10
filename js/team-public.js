/* ============================================================
   PHASE 6A — Team Management (public About page)
   Replaces the previously hardcoded Team section (Elena Marsh, Theo
   Reyes, Sana Khoury, Jules Bennett) with real data from the
   TeamMember collection (published only, sorted by displayOrder).
   Mirrors js/homepage-portfolio.js's fetch/render/fail-safe approach
   and reveal/stagger re-init.
   ============================================================ */

(function () {
  const API_BASE = window.STSK_API_BASE || '';

  const section = document.getElementById('team-section');
  const kickerEl = document.getElementById('team-kicker');
  const headingEl = document.getElementById('team-heading');
  const loadingEl = document.getElementById('team-loading');
  const errorEl = document.getElementById('team-error-state');
  const grid = document.getElementById('team-grid');

  if (!grid) return; // not on the About page

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function applySectionContent(content) {
    if (!content) return;
    if (kickerEl && content.kicker) kickerEl.textContent = content.kicker;
    if (headingEl && content.heading) headingEl.textContent = content.heading;
  }

  async function loadSectionContent() {
    try {
      const response = await fetch(`${API_BASE}/api/team/section-content`, { credentials: 'omit' });
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.success) applySectionContent(data.data);
    } catch {
      // Non-critical — static fallback copy already sits in the markup.
    }
  }

  const SOCIAL_ICONS = {
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>',
    other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
  };

  /**
   * Only renders icons for socials the admin actually configured — an
   * empty/missing URL never produces a broken or dead link.
   */
  function socialsHtml(member) {
    const links = [
      member.instagramUrl ? { key: 'instagram', url: member.instagramUrl, label: 'Instagram' } : null,
      member.linkedinUrl ? { key: 'linkedin', url: member.linkedinUrl, label: 'LinkedIn' } : null,
      member.otherSocialUrl ? { key: 'other', url: member.otherSocialUrl, label: 'social' } : null,
    ].filter(Boolean);

    if (links.length === 0) return '';

    const items = links
      .map(
        (link) => `
          <a class="team-social-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(member.name)} on ${escapeHtml(link.label)}">
            ${SOCIAL_ICONS[link.key]}
          </a>
        `
      )
      .join('');

    return `<div class="team-socials">${items}</div>`;
  }

  function cardHtml(member) {
    const photoInner = member.image
      ? `<img src="${escapeHtml(API_BASE + member.image)}" alt="${escapeHtml(member.name)} — ${escapeHtml(member.role)}" loading="lazy">`
      : `<span class="team-initials">${escapeHtml(member.initials || '')}</span>`;

    return `
      <article class="team-card reveal reveal-stagger">
        <div class="team-photo">${photoInner}</div>
        <h3 class="team-name">${escapeHtml(member.name)}</h3>
        <p class="team-role">${escapeHtml(member.role)}</p>
        ${socialsHtml(member)}
      </article>
    `;
  }

  function showState(state) {
    // state: 'loading' | 'error' | 'ready'
    loadingEl.hidden = state !== 'loading';
    if (errorEl) errorEl.hidden = state !== 'error';
    grid.hidden = state !== 'ready';
  }

  /**
   * Newly-rendered cards carry .reveal but main.js's IntersectionObserver
   * already ran once on DOMContentLoaded and won't see elements added
   * afterward. Re-run the same observation logic here, scoped to just
   * these cards, so they still get the fade/stagger-in treatment instead
   * of appearing with no animation (or stuck invisible).
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

  async function loadTeamMembers() {
    showState('loading');

    let response;
    try {
      response = await fetch(`${API_BASE}/api/team`, { credentials: 'omit' });
    } catch {
      // Network failure: hide the whole section cleanly rather than ever
      // showing stale/fake dummy members. The rest of the About page
      // (hero/story/mission/etc.) is unaffected.
      if (section) section.hidden = true;
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
      if (section) section.hidden = true;
      showState('error');
      return;
    }

    const members = data.data || [];

    if (members.length === 0) {
      // Prefer hiding the section entirely over showing an empty grid or
      // any fallback/dummy content.
      if (section) section.hidden = true;
      showState('error');
      return;
    }

    grid.innerHTML = members.map(cardHtml).join('');
    showState('ready');
    observeRevealForGrid();
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadSectionContent();
    loadTeamMembers();
  });
})();
